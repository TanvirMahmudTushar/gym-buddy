# Access token rejection (NFR-12, FR-15): a missing, tampered or expired token, and a token whose session ended.
import os
from datetime import timedelta

import jwt

from app.models import utc_now
from app.security import ACCESS_TOKEN_LIFETIME, ALGORITHM, read_access_token

ME = "/api/v1/users/me"


def _token(client) -> str:
    return client.headers["Authorization"].removeprefix("Bearer ")


def test_valid_token_works(account):
    me = account("rafi")
    assert me.client.get(ME).status_code == 200


def test_missing_token_gets_401(anon):
    response = anon.get(ME)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_garbage_token_gets_401(anon):
    assert anon.get(ME, headers={"Authorization": "Bearer not-a-jwt"}).status_code == 401


def test_tampered_token_gets_401(account, anon):
    me = account("sara")
    header, payload, signature = _token(me.client).split(".")
    flipped = ("A" if signature[0] != "A" else "B") + signature[1:]
    assert anon.get(ME, headers={"Authorization": f"Bearer {header}.{payload}.{flipped}"}).status_code == 401


def test_token_with_a_changed_user_id_gets_401(account, anon):
    """Changing the payload breaks the signature, so nobody can make a token for another account."""
    me = account("nadia")
    other = account("omar")
    claims = jwt.decode(_token(me.client), options={"verify_signature": False})
    forged = jwt.encode(
        {**claims, "sub": str(other.id)}, "a-guessed-secret-that-is-not-the-real-one!", algorithm=ALGORITHM
    )
    assert anon.get(ME, headers={"Authorization": f"Bearer {forged}"}).status_code == 401


def test_expired_token_gets_401(account, anon):
    me = account("tia")
    claims = jwt.decode(_token(me.client), os.environ["JWT_SECRET"], algorithms=[ALGORITHM])
    past = utc_now() - timedelta(minutes=30)
    expired = jwt.encode(
        {**claims, "iat": past, "exp": past + ACCESS_TOKEN_LIFETIME}, os.environ["JWT_SECRET"], algorithm=ALGORITHM
    )
    assert anon.get(ME, headers={"Authorization": f"Bearer {expired}"}).status_code == 401


def test_token_is_valid_for_5_minutes(account):
    me = account("lina")
    claims = jwt.decode(_token(me.client), os.environ["JWT_SECRET"], algorithms=[ALGORITHM])
    assert claims["exp"] - claims["iat"] == 5 * 60


def test_token_without_a_session_id_gets_401(account, anon):
    me = account("gus")
    claims = jwt.decode(_token(me.client), os.environ["JWT_SECRET"], algorithms=[ALGORITHM])
    claims.pop("sid")
    old_style = jwt.encode(claims, os.environ["JWT_SECRET"], algorithm=ALGORITHM)
    assert anon.get(ME, headers={"Authorization": f"Bearer {old_style}"}).status_code == 401


def test_token_stops_working_after_logout(account):
    me = account("ugo")
    assert me.client.get(ME).status_code == 200
    # Logout revokes the session by its refresh cookie; the 5-minute access token stops at once, not when it expires.
    assert me.client.post("/api/v1/auth/logout").status_code == 204
    assert me.client.get(ME).status_code == 401
    assert read_access_token(_token(me.client))  # still a well-signed, unexpired token: only its session ended


def test_token_stops_working_when_the_user_is_banned(account):
    admin = account("ada", role="admin")
    me = account("ben")
    admin.client.post(f"/api/v1/admin/users/{me.id}/ban", json={"reason": "test"})
    response = me.client.get(ME)
    assert response.status_code == 403 and response.json()["detail"] == "Account banned"
