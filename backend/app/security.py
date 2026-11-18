# Password hashing (Argon2) and access tokens (JWT). The secret comes from the JWT_SECRET env var.
import logging
import os
import secrets
from datetime import timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.models import utc_now

logger = logging.getLogger("gym_buddy")

ALGORITHM = "HS256"
ACCESS_TOKEN_LIFETIME = timedelta(hours=8)
MIN_SECRET_BYTES = 32

_hasher = PasswordHasher()
# Checked when the email is unknown, so a wrong email takes as long as a wrong password.
_DUMMY_HASH = _hasher.hash("not-a-real-password")


class InvalidTokenError(Exception):
    """The token is missing, malformed, expired or not signed with our secret."""


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def _secret() -> str:
    secret = os.getenv("JWT_SECRET")
    if secret and len(secret.encode()) >= MIN_SECRET_BYTES:
        return secret
    if os.getenv("VERCEL"):
        # A random secret per serverless instance would reject tokens from another instance.
        raise RuntimeError(f"JWT_SECRET must be set to at least {MIN_SECRET_BYTES} bytes")
    return _dev_secret()


_generated_secret: str | None = None


def _dev_secret() -> str:
    """Local development only: a random secret per run, so tokens stop working when the server restarts."""
    global _generated_secret
    if _generated_secret is None:
        logger.warning("JWT_SECRET is not set; using a temporary secret for this run")
        _generated_secret = secrets.token_urlsafe(48)
    return _generated_secret


def create_access_token(user_id: int) -> str:
    now = utc_now()
    payload = {"sub": str(user_id), "iat": now, "exp": now + ACCESS_TOKEN_LIFETIME}
    return jwt.encode(payload, _secret(), algorithm=ALGORITHM)


def read_access_token(token: str) -> int:
    """Return the user id inside the token, or raise InvalidTokenError."""
    try:
        payload = jwt.decode(token, _secret(), algorithms=[ALGORITHM], options={"require": ["sub", "exp"]})
        return int(payload["sub"])
    except (jwt.PyJWTError, ValueError) as exc:
        raise InvalidTokenError from exc
