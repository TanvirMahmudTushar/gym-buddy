# Refresh token rotation and reuse detection (FR-14, FR-82, NFR-13, NFR-14).
from datetime import timedelta

from app.services import session_service
from conftest import new_client

REFRESH = "/api/v1/auth/refresh"
ME = "/api/v1/users/me"


def _cookie(client) -> str:
    return client.cookies.get("refresh_token")


def _refresh_with(cookie: str):
    """Send one refresh cookie from a fresh client, the way a second browser (or a thief) would."""
    return new_client().post(REFRESH, headers={"Cookie": f"refresh_token={cookie}"})


def test_no_cookie_means_not_logged_in(anon):
    assert anon.post(REFRESH).status_code == 204


def test_refresh_rotates_the_cookie_and_gives_a_working_token(account):
    me = account("rafi")
    first = _cookie(me.client)
    response = me.client.post(REFRESH)
    assert response.status_code == 200
    second = _cookie(me.client)
    assert second and second != first
    token = response.json()["access_token"]
    assert new_client().get(ME, headers={"Authorization": f"Bearer {token}"}).status_code == 200


def test_old_cookie_within_the_grace_period_gets_a_token_but_no_new_cookie(account):
    """Two tabs refreshing at the same moment: the one that loses the race still gets an access token."""
    me = account("sara")
    old = _cookie(me.client)
    assert me.client.post(REFRESH).status_code == 200
    late = _refresh_with(old)
    assert late.status_code == 200 and "set-cookie" not in late.headers


def test_reusing_a_replaced_cookie_ends_the_whole_session(account, monkeypatch):
    monkeypatch.setattr(session_service, "ROTATION_GRACE", timedelta(0))
    me = account("nadia")
    stolen = _cookie(me.client)
    rotated = me.client.post(REFRESH)  # the real user rotates first
    assert rotated.status_code == 200
    current_token = rotated.json()["access_token"]

    reuse = _refresh_with(stolen)
    assert reuse.status_code == 401
    assert 'refresh_token=""' in reuse.headers["set-cookie"]  # the rejected cookie is cleared

    # Only a copy can still hold a replaced token, so both holders are logged out.
    assert me.client.post(REFRESH).status_code == 401
    assert new_client().get(ME, headers={"Authorization": f"Bearer {current_token}"}).status_code == 401


def test_a_cookie_two_rotations_old_is_refused(account, monkeypatch):
    """Only the last replaced token is remembered (auth_session.previous_token_hash). An older one is refused like
    an unknown token; it does not end the session, because the server can no longer tell it was this session's."""
    monkeypatch.setattr(session_service, "ROTATION_GRACE", timedelta(0))
    me = account("tia")
    oldest = _cookie(me.client)
    me.client.post(REFRESH)
    me.client.post(REFRESH)
    assert _refresh_with(oldest).status_code == 401
    assert me.client.post(REFRESH).status_code == 200


def test_refresh_after_logout_is_refused(account):
    me = account("omar")
    cookie = _cookie(me.client)
    me.client.post("/api/v1/auth/logout")
    assert _refresh_with(cookie).status_code == 401


def test_banned_user_cannot_refresh(account):
    admin = account("ada", role="admin")
    me = account("ben")
    cookie = _cookie(me.client)
    admin.client.post(f"/api/v1/admin/users/{me.id}/ban")
    assert _refresh_with(cookie).status_code == 401
