# Login: the right password, a wrong one, and the lockout after 5 wrong passwords in a row (FR-13, FR-34).
from datetime import timedelta

from conftest import PASSWORD
from sqlmodel import Session, col, select, update

from app.database import engine
from app.models import ActivityLog, utc_now
from app.services.auth_service import LOCKOUT, MAX_FAILED_LOGINS


def test_right_password_gives_tokens_and_a_refresh_cookie(account, anon):
    me = account("rafi")
    response = anon.post("/api/v1/auth/login", json={"email": me.email, "password": PASSWORD})
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer" and body["expires_in"] == 300
    assert body["user"]["email"] == me.email and body["user"]["permissions"] == []
    cookie = response.headers["set-cookie"]
    assert "refresh_token=" in cookie and "HttpOnly" in cookie and "Secure" in cookie
    assert "samesite=strict" in cookie.lower() and "Path=/api/v1/auth" in cookie


def test_email_is_not_case_sensitive(account, anon):
    me = account("sara")
    response = anon.post("/api/v1/auth/login", json={"email": me.email.upper(), "password": PASSWORD})
    assert response.status_code == 200


def test_wrong_password_and_unknown_email_get_the_same_401(account, anon):
    me = account("nadia")
    wrong = anon.post("/api/v1/auth/login", json={"email": me.email, "password": "not-the-password"})
    unknown = anon.post("/api/v1/auth/login", json={"email": "nobody@test.example", "password": "not-the-password"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json() == {"detail": "Wrong email or password"}
    assert "set-cookie" not in wrong.headers


def test_fifth_wrong_password_locks_the_account(account, anon):
    me = account("omar")
    codes = [
        anon.post("/api/v1/auth/login", json={"email": me.email, "password": "wrong-password"}).status_code
        for _ in range(MAX_FAILED_LOGINS)
    ]
    assert codes == [401] * (MAX_FAILED_LOGINS - 1) + [429]

    # Even the right password waits until the lockout ends, and says how long.
    locked = anon.post("/api/v1/auth/login", json={"email": me.email, "password": PASSWORD})
    assert locked.status_code == 429
    assert int(locked.headers["retry-after"]) > 0
    assert "Try again in" in locked.json()["detail"]


def test_a_right_password_resets_the_count(account, anon):
    me = account("tia")
    for _ in range(MAX_FAILED_LOGINS - 1):
        anon.post("/api/v1/auth/login", json={"email": me.email, "password": "wrong-password"})
    assert anon.post("/api/v1/auth/login", json={"email": me.email, "password": PASSWORD}).status_code == 200
    # The run of failures starts again, so one more wrong password is a plain 401, not a lockout.
    assert anon.post("/api/v1/auth/login", json={"email": me.email, "password": "wrong-password"}).status_code == 401


def test_failed_logins_are_in_the_activity_log_without_the_password(account, anon):
    admin = account("ada", role="admin")
    me = account("gus")
    anon.post("/api/v1/auth/login", json={"email": me.email, "password": "secret-guess-123"})
    rows = admin.client.get("/api/v1/admin/activity", params={"event": "login_failed"}).json()["items"]
    assert len(rows) == 1 and rows[0]["actor_email"] == me.email and rows[0]["details"] == "Wrong password"
    assert "secret-guess-123" not in str(rows)


def _try(anon, email: str, password: str = "wrong-password"):
    return anon.post("/api/v1/auth/login", json={"email": email, "password": password})


def test_an_email_with_no_account_is_locked_like_an_account(account, anon):
    """Otherwise only a real account would answer 429, and the answer would tell a stranger which emails exist."""
    ghost, real = "ghost@test.example", account("real").email
    # Wrong passwords on a real account, from another client, do not count towards the unknown email.
    for _ in range(MAX_FAILED_LOGINS - 1):
        _try(anon, real)
    codes = [_try(anon, ghost).status_code for _ in range(MAX_FAILED_LOGINS)]
    assert codes == [401] * (MAX_FAILED_LOGINS - 1) + [429]

    # The same answer as a locked account gives: 429 with Retry-After, whatever the password.
    locked = _try(anon, ghost, PASSWORD)
    assert locked.status_code == 429 and "Try again in" in locked.json()["detail"]
    assert 0 < int(locked.headers["retry-after"]) <= LOCKOUT.total_seconds()
    # Another unknown email is not affected.
    assert _try(anon, "other-ghost@test.example").status_code == 401


def test_the_block_on_an_unknown_email_ends_after_the_lockout_and_attempts_do_not_extend_it(account, anon):
    admin = account("ada", role="admin")
    ghost = "ghost@test.example"
    for _ in range(MAX_FAILED_LOGINS):
        _try(anon, ghost)
    for _ in range(3):  # Made while blocked: must not push the end further out.
        assert _try(anon, ghost).status_code == 429
    # One lockout is recorded, not one per refused attempt.
    rows = admin.client.get("/api/v1/admin/activity", params={"event": "account_locked"}).json()["items"]
    assert [r["target_email"] for r in rows] == [ghost]

    # 15 minutes later the five wrong attempts have aged out.
    with Session(engine) as session:
        session.exec(update(ActivityLog).where(col(ActivityLog.actor_email) == ghost).values(created_at=utc_now() - LOCKOUT - timedelta(seconds=1)))
        session.commit()
        assert session.exec(select(ActivityLog).where(col(ActivityLog.actor_email) == ghost)).first() is not None
    assert _try(anon, ghost).status_code == 401
