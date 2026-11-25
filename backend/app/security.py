# Password hashing (Argon2 with a pepper), access tokens (JWT) and refresh tokens (TDD 10.1, 10.2).
# The secrets come from the JWT_SECRET and PASSWORD_PEPPER env vars.
import functools
import hashlib
import hmac
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
ACCESS_TOKEN_LIFETIME = timedelta(minutes=5)
MIN_SECRET_BYTES = 32
# Hashes made with the pepper start with this, so a hash from before the pepper can still be checked (once).
PEPPERED_PREFIX = "peppered$"
# Only for a developer machine without PASSWORD_PEPPER. Fixed, not random, so local passwords survive a restart.
_DEV_PEPPER = "local-development-pepper-never-used-on-vercel"

_hasher = PasswordHasher()


class InvalidTokenError(Exception):
    """The token is missing, malformed, expired or not signed with our secret."""


class ExpiredTokenError(InvalidTokenError):
    """The token was ours and is only out of date. This happens every few minutes, so it is not a sign of an attack."""


def _env_secret(name: str) -> str | None:
    """The env var when it is at least 32 bytes long. Required on Vercel; None on a developer machine without it."""
    value = os.getenv(name)
    if value and len(value.encode()) >= MIN_SECRET_BYTES:
        return value
    if os.getenv("VERCEL"):
        raise RuntimeError(f"{name} must be set to at least {MIN_SECRET_BYTES} bytes")
    return None


# --- Passwords ---


@functools.cache
def _pepper() -> bytes:
    pepper = _env_secret("PASSWORD_PEPPER")
    if pepper is None:
        logger.warning("PASSWORD_PEPPER is not set; using the fixed development pepper")
        pepper = _DEV_PEPPER
    return pepper.encode()


def _peppered(password: str) -> str:
    """HMAC-SHA256 of the password, keyed with the pepper. The pepper lives only in the server's environment, so
    someone who copies the database still cannot test guesses against the hashes."""
    return hmac.new(_pepper(), password.encode(), hashlib.sha256).hexdigest()


def hash_password(password: str) -> str:
    return PEPPERED_PREFIX + _hasher.hash(_peppered(password))


@functools.cache
def _dummy_hash() -> str:
    # Checked when the email is unknown, so a wrong email takes as long as a wrong password.
    return hash_password("not-a-real-password")


def verify_password(password: str, password_hash: str | None) -> bool:
    stored = password_hash or _dummy_hash()
    if stored.startswith(PEPPERED_PREFIX):
        stored, candidate = stored.removeprefix(PEPPERED_PREFIX), _peppered(password)
    else:
        # A hash made before the pepper was added: checked as it was made, then replaced at login (see below).
        candidate = password
    try:
        return _hasher.verify(stored, candidate) and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    """True for a hash made before the pepper or with older Argon2 settings, which login then replaces."""
    if not password_hash.startswith(PEPPERED_PREFIX):
        return True
    return _hasher.check_needs_rehash(password_hash.removeprefix(PEPPERED_PREFIX))


# --- Access tokens (JWT) ---

_generated_secret: str | None = None


def _jwt_secret() -> str:
    secret = _env_secret("JWT_SECRET")
    return secret if secret is not None else _dev_secret()


def _dev_secret() -> str:
    """Local development only: a random secret per run, so tokens stop working when the server restarts."""
    global _generated_secret
    if _generated_secret is None:
        logger.warning("JWT_SECRET is not set; using a temporary secret for this run")
        _generated_secret = secrets.token_urlsafe(48)
    return _generated_secret


def create_access_token(user_id: int, role: str, session_id: int) -> str:
    """Valid for 5 minutes. `sid` names the login session, so logging out or revoking the session ends this token
    at once. `role` is there for the client; the server always checks the role stored in the database."""
    now = utc_now()
    payload = {"sub": str(user_id), "role": role, "sid": session_id, "iat": now, "exp": now + ACCESS_TOKEN_LIFETIME}
    return jwt.encode(payload, _jwt_secret(), algorithm=ALGORITHM)


def read_access_token(token: str) -> tuple[int, int]:
    """Return the user id and the session id, or raise InvalidTokenError: a bad signature (tampered), an expired
    token (ExpiredTokenError, a kind of InvalidTokenError), or a missing claim (such as a token from before sessions
    existed)."""
    try:
        payload = jwt.decode(
            token, _jwt_secret(), algorithms=[ALGORITHM], options={"require": ["sub", "sid", "iat", "exp"]}
        )
        return int(payload["sub"]), int(payload["sid"])
    except jwt.ExpiredSignatureError as exc:
        raise ExpiredTokenError from exc
    except (jwt.PyJWTError, ValueError, TypeError) as exc:
        raise InvalidTokenError from exc


# --- Refresh tokens ---


def new_refresh_token() -> str:
    """A random 256-bit token for the refresh cookie. The database keeps only its hash."""
    return secrets.token_urlsafe(32)


def hash_refresh_token(token: str) -> str:
    """Plain SHA-256 is enough here (no salt, no slow hash): the token is random, so no list of guesses can find it."""
    return hashlib.sha256(token.encode()).hexdigest()
