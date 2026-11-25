# The admin Security view: failed logins, rejected tokens and denied requests per IP address, with the emails tried and
# the browser, for a chosen number of hours and a minimum count.
import os
from datetime import timedelta

import jwt
from sqlmodel import Session, select

from app.database import engine
from app.models import ActivityLog, utc_now
from app.security import ACCESS_TOKEN_LIFETIME, ALGORITHM

SECURITY = "/api/v1/admin/activity/security"
ME = "/api/v1/users/me"


def _wrong_logins(anon, email, times):
    for _ in range(times):
        body = {"email": email, "password": "wrong-password"}
        anon.post("/api/v1/auth/login", json=body, headers={"User-Agent": "TestBrowser/1.0"})


def _events(row) -> dict:
    return {e["event"]: e["count"] for e in row["events"]}


def test_an_address_shows_what_happened_the_emails_tried_and_the_browser(account, anon):
    admin = account("ada", role="admin")
    _wrong_logins(anon, "one@test.example", 2)
    _wrong_logins(anon, "two@test.example", 2)
    anon.get(ME, headers={"Authorization": "Bearer not-a-jwt"})

    summary = admin.client.get(SECURITY).json()
    assert (summary["hours"], summary["min_count"]) == (24, 3)
    assert summary["failed_logins"] == 4 and summary["total"] == 5

    (row,) = summary["by_ip"]
    assert row["count"] == 5 and _events(row) == {"login_failed": 4, "auth_rejected": 1}
    # The most failures come first.
    assert row["events"][0]["event"] == "login_failed"
    assert row["accounts"] == 2 and set(row["emails"]) == {"one@test.example", "two@test.example"}
    assert row["user_agent"] is not None


def test_a_tampered_token_is_logged_but_an_expired_or_missing_one_is_not(account, anon):
    admin = account("ada", role="admin")
    me = account("rafi")
    token = me.client.headers["Authorization"].removeprefix("Bearer ")
    claims = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[ALGORITHM])
    past = utc_now() - timedelta(minutes=30)
    expired = jwt.encode(
        {**claims, "iat": past, "exp": past + ACCESS_TOKEN_LIFETIME}, os.environ["JWT_SECRET"], algorithm=ALGORITHM
    )
    forged = jwt.encode(claims, "a-guessed-secret-that-is-not-the-real-one!", algorithm=ALGORITHM)

    assert anon.get(ME).status_code == 401
    assert anon.get(ME, headers={"Authorization": f"Bearer {expired}"}).status_code == 401
    assert admin.client.get("/api/v1/admin/activity", params={"event": "auth_rejected"}).json()["total"] == 0

    assert anon.get(ME, headers={"Authorization": f"Bearer {forged}"}).status_code == 401
    rows = admin.client.get("/api/v1/admin/activity", params={"event": "auth_rejected"}).json()["items"]
    assert len(rows) == 1 and rows[0]["actor_id"] is None
    # The token itself is never written to the log.
    assert forged not in str(rows)


def test_a_flood_of_bad_tokens_adds_one_row_a_minute_for_each_address(account, anon):
    admin = account("ada", role="admin")
    for _ in range(20):
        assert anon.get(ME, headers={"Authorization": "Bearer not-a-jwt"}).status_code == 401
    params = {"event": "auth_rejected"}
    assert admin.client.get("/api/v1/admin/activity", params=params).json()["total"] == 1

    # A minute later the same address is logged again.
    with Session(engine) as session:
        row = session.exec(select(ActivityLog).where(ActivityLog.event == "auth_rejected")).one()
        row.created_at = utc_now() - timedelta(minutes=2)
        session.add(row)
        session.commit()
    anon.get(ME, headers={"Authorization": "Bearer not-a-jwt"})
    assert admin.client.get("/api/v1/admin/activity", params=params).json()["total"] == 2


def test_a_refused_request_is_logged_with_who_asked(account):
    admin = account("ada", role="admin")
    me = account("rafi")
    assert me.client.get(SECURITY).status_code == 403

    rows = admin.client.get("/api/v1/admin/activity", params={"event": "access_denied"}).json()["items"]
    assert len(rows) == 1
    assert rows[0]["actor_id"] == me.id and rows[0]["actor_email"] == me.email
    assert rows[0]["details"] == "GET /api/v1/admin/activity/security needs activity:read"


def test_min_count_hides_the_quiet_addresses_and_emails(account, anon):
    admin = account("ada", role="admin")
    _wrong_logins(anon, "one@test.example", 2)

    assert admin.client.get(SECURITY, params={"min_count": 2}).json()["by_ip"][0]["count"] == 2
    quiet = admin.client.get(SECURITY, params={"min_count": 3}).json()
    assert quiet["by_ip"] == [] and quiet["by_account"] == []
    # The totals still count everything.
    assert quiet["total"] == 2


def test_by_account_counts_failed_logins_only(account, anon):
    admin = account("ada", role="admin")
    me = account("rafi")
    _wrong_logins(anon, me.email, 3)
    anon.get(ME, headers={"Authorization": "Bearer not-a-jwt"})

    (row,) = admin.client.get(SECURITY).json()["by_account"]
    assert row["email"] == me.email and row["user_id"] == me.id and row["count"] == 3 and row["ips"] == 1


def test_old_events_fall_outside_the_window(account, anon):
    admin = account("ada", role="admin")
    _wrong_logins(anon, "one@test.example", 3)
    with Session(engine) as session:
        for row in session.exec(select(ActivityLog).where(ActivityLog.event == "login_failed")):
            row.created_at = utc_now() - timedelta(hours=5)
            session.add(row)
        session.commit()

    assert admin.client.get(SECURITY, params={"hours": 1}).json()["total"] == 0
    assert admin.client.get(SECURITY, params={"hours": 6}).json()["total"] == 3


def test_hours_and_min_count_have_limits(account):
    admin = account("ada", role="admin")
    for params in ({"hours": 0}, {"hours": 169}, {"min_count": 0}, {"min_count": "many"}):
        assert admin.client.get(SECURITY, params=params).status_code == 422
