# Login devices (FR-80, FR-81): one device for each refresh token that is still valid.
from datetime import timedelta

from conftest import PASSWORD, login, new_client
from sqlmodel import Session, select

from app.database import engine
from app.models import AuthSession, utc_now

DEVICES = "/api/v1/users/me/sessions"
LOGIN = "/api/v1/auth/login"
REFRESH = "/api/v1/auth/refresh"
PHONE = "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36"


def _devices(client) -> list[dict]:
    response = client.get(DEVICES)
    assert response.status_code == 200, response.text
    return response.json()


def test_each_login_is_a_device_and_the_one_asking_is_marked(account):
    me = account("rafi")
    phone = new_client()
    phone.headers["User-Agent"] = PHONE
    body = phone.post(LOGIN, json={"email": me.email, "password": PASSWORD}).json()
    phone.headers["Authorization"] = f"Bearer {body['access_token']}"

    devices = _devices(phone)
    assert len(devices) == 2
    assert [d["user_agent"] for d in devices if d["current"]] == [PHONE]
    assert [d["user_agent"] for d in _devices(me.client) if d["current"]] != [PHONE]
    # Nothing that could be used to log in is in the list.
    assert not {"token_hash", "previous_token_hash"} & devices[0].keys()


def test_a_refresh_keeps_the_same_device(account):
    me = account("sara")
    before = _devices(me.client)
    assert me.client.post(REFRESH).status_code == 200
    after = _devices(me.client)
    assert [d["id"] for d in after] == [d["id"] for d in before]
    assert after[0]["last_used_at"] > before[0]["last_used_at"]
    assert after[0]["expires_at"] > before[0]["expires_at"]


def test_a_device_whose_refresh_token_expired_is_not_listed(account):
    me = account("nadia")
    old = _devices(me.client)[0]["id"]
    other = login(me.email)
    with Session(engine) as session:
        row = session.get(AuthSession, old)
        row.expires_at = utc_now() - timedelta(seconds=1)
        session.add(row)
        session.commit()
    devices = _devices(other)
    assert len(devices) == 1 and devices[0]["id"] != old


def test_logging_a_device_out_ends_its_refresh_and_access_tokens(account):
    me = account("omar")
    other = login(me.email)
    target = next(d["id"] for d in _devices(me.client) if not d["current"])
    assert me.client.delete(f"{DEVICES}/{target}").status_code == 204
    assert other.get("/api/v1/users/me").status_code == 401
    assert other.post(REFRESH).status_code == 401
    assert [d["current"] for d in _devices(me.client)] == [True]
    assert me.client.delete(f"{DEVICES}/{target}").status_code == 404  # no longer active


def test_logging_in_again_on_the_same_browser_replaces_its_device(account):
    """The browser's refresh cookie is overwritten, so the earlier device could never be used again."""
    me = account("tia")
    earlier = _devices(me.client)[0]["id"]
    body = me.client.post(LOGIN, json={"email": me.email, "password": PASSWORD}).json()
    assert me.client.get("/api/v1/users/me").status_code == 401  # the earlier access token
    me.client.headers["Authorization"] = f"Bearer {body['access_token']}"
    devices = _devices(me.client)
    assert len(devices) == 1 and devices[0]["current"] and devices[0]["id"] != earlier


def test_a_failed_login_does_not_end_the_device_on_that_browser(account):
    me = account("gus")
    assert me.client.post(LOGIN, json={"email": me.email, "password": "not-the-password"}).status_code == 401
    assert len(_devices(me.client)) == 1


def test_another_account_logging_in_on_the_browser_ends_the_first_ones_device(account):
    admin = account("ada", role="admin")
    first = account("ben")
    second = account("lina")
    assert first.client.post(LOGIN, json={"email": second.email, "password": PASSWORD}).status_code == 200
    with Session(engine) as session:
        rows = session.exec(select(AuthSession).where(AuthSession.user_id == first.id)).all()
        assert [row.revoked_at is not None for row in rows] == [True]
    # The log names who logged in and whose device ended.
    log = admin.client.get("/api/v1/admin/activity", params={"event": "session_revoke"}).json()["items"]
    assert len(log) == 1 and log[0]["actor_email"] == second.email and log[0]["target_email"] == first.email
