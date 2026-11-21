# Sign up and log in. Everyone who signs up is a plain user; only an admin can change a role (user_service).
from datetime import datetime, timedelta

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, select, update

from app.models import LoginRequest, SignupRequest, User, as_utc, utc_now
from app.security import hash_password, password_needs_rehash, verify_password
from app.services import session_service


class EmailTakenError(Exception):
    """An account with this email already exists."""


ACCOUNT_BANNED_MESSAGE = "Account banned"
# The answer to every request but GET /users/me and POST /users/me/password after an admin reset the password.
MUST_CHANGE_PASSWORD_MESSAGE = "Choose a new password first"


class AccountBannedError(Exception):
    """The password is right but an admin has banned this account."""


class WrongPasswordError(Exception):
    """The current password given when changing the password is wrong."""


class SamePasswordError(Exception):
    """The new password is the same as the current one (such as the temporary password an admin gave)."""


class InvalidCredentialsError(Exception):
    """Wrong email or wrong password; the two are deliberately not told apart."""


# Login lockout (FR-34, TDD 10.2): this many wrong passwords in a row block the account's logins for LOCKOUT.
MAX_FAILED_LOGINS = 5
LOCKOUT = timedelta(minutes=15)


class AccountLockedError(Exception):
    """Too many wrong passwords in a row: logins are blocked until `until` (UTC), even with the right password."""

    def __init__(self, until: datetime):
        super().__init__(until)
        self.until = until


def _find_by_email(session: Session, email: str) -> User | None:
    return session.exec(select(User).where(User.email == email.lower())).first()


def signup(session: Session, data: SignupRequest) -> User:
    email = data.email.lower()
    if _find_by_email(session, email) is not None:
        raise EmailTakenError(email)
    user = User(email=email, name=data.name, password_hash=hash_password(data.password), role="user")
    session.add(user)
    try:
        session.commit()
    except IntegrityError as exc:
        # Two sign-ups with the same email at the same moment: the unique index lets only one through.
        session.rollback()
        raise EmailTakenError(email) from exc
    session.refresh(user)
    return user


def _locked_until(user: User) -> datetime | None:
    """When the account's lockout ends, or None if it is not locked (or the lockout has run out)."""
    if user.locked_until is None:
        return None
    until = as_utc(user.locked_until)
    return until if until > utc_now() else None


def _record_failed_login(session: Session, user: User) -> None:
    """Count a wrong password; the 5th in a row locks the account and starts the count again."""
    # The + 1 runs in the database, so two wrong passwords sent at the same moment both count.
    session.exec(
        update(User).where(col(User.id) == user.id).values(failed_login_count=col(User.failed_login_count) + 1)
    )
    session.commit()
    session.refresh(user)
    if user.failed_login_count >= MAX_FAILED_LOGINS:
        user.failed_login_count = 0
        user.locked_until = utc_now() + LOCKOUT
        session.add(user)
        session.commit()
        raise AccountLockedError(as_utc(user.locked_until))


def authenticate(session: Session, data: LoginRequest) -> User:
    user = _find_by_email(session, data.email)
    # A locked account is refused before the password is checked, so even the right password waits.
    if user is not None and (until := _locked_until(user)) is not None:
        raise AccountLockedError(until)
    # With no user this still checks a dummy hash, so both failures take about the same time.
    password_ok = verify_password(data.password, user.password_hash if user else None)
    if user is None or not password_ok:
        if user is not None:
            _record_failed_login(session, user)
        raise InvalidCredentialsError
    # The right password ends the run of failures.
    changed = bool(user.failed_login_count or user.locked_until is not None)
    user.failed_login_count = 0
    user.locked_until = None
    # A hash from before the pepper is replaced now, while the plain password is at hand.
    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(data.password)
        changed = True
    if changed:
        session.add(user)
        session.commit()
        session.refresh(user)
    # Checked only after the password, so a stranger cannot find out who is banned.
    if user.is_banned:
        raise AccountBannedError
    return user


def change_password(
    session: Session, user: User, current_password: str, new_password: str, current_session_id: int
) -> None:
    """Every other session of the user is revoked in the same transaction (FR-41); the one making the change stays
    logged in. Also ends the must-change-password state an admin reset leaves."""
    if not verify_password(current_password, user.password_hash):
        raise WrongPasswordError
    if verify_password(new_password, user.password_hash):
        raise SamePasswordError
    user.password_hash = hash_password(new_password)
    user.password_changed_at = utc_now()
    user.must_change_password = False
    session.add(user)
    session_service.revoke_all(session, user.id, keep=current_session_id)
    session.commit()
