# Sign up and log in. Everyone who signs up is a plain user; only an admin can change a role (user_service).
# Every failed login and failed password change is written to the activity log (FR-85) before the error is raised.
from datetime import datetime, timedelta

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, select, update

from app.models import (
    MAX_PASSWORD_LENGTH,
    MIN_PASSWORD_LENGTH,
    ActivityEvent,
    ActivityLog,
    LoginRequest,
    SignupRequest,
    User,
    as_utc,
    utc_now,
)
from app.request_info import Client
from app.security import hash_password, password_needs_rehash, verify_password
from app.services import activity_service, session_service


class EmailTakenError(Exception):
    """An account with this email already exists."""


ACCOUNT_BANNED_MESSAGE = "Account banned"
# The activity row a login with an email that has no account leaves; the lockout for such emails counts these rows.
NO_ACCOUNT_REASON = "No account has this email"
# The answer to every request but GET /users/me and POST /users/me/password after an admin reset the password.
MUST_CHANGE_PASSWORD_MESSAGE = "Choose a new password first"


class AccountBannedError(Exception):
    """The password is right but an admin has banned this account."""


class WrongPasswordError(Exception):
    """The current password given when changing the password is wrong."""


class PasswordLengthError(Exception):
    """The new password is too short or too long."""


class SamePasswordError(Exception):
    """The new password is the same as the current one (such as the temporary password an admin gave)."""


class InvalidCredentialsError(Exception):
    """Wrong email or wrong password; the two are deliberately not told apart."""


# Lockout (FR-34, TDD 10.2): this many wrong passwords in a row, on Log in or on a password change, block the account's
# logins and password changes for LOCKOUT.
MAX_FAILED_LOGINS = 5
LOCKOUT = timedelta(minutes=15)


class AccountLockedError(Exception):
    """Too many wrong passwords in a row: blocked until `until` (UTC), even with the right password."""

    def __init__(self, until: datetime):
        super().__init__(until)
        self.until = until


def _find_by_email(session: Session, email: str) -> User | None:
    return session.exec(select(User).where(User.email == email.lower())).first()


def signup(session: Session, data: SignupRequest, client: Client) -> User:
    email = data.email.lower()
    if _find_by_email(session, email) is not None:
        raise EmailTakenError(email)
    user = User(email=email, name=data.name, password_hash=hash_password(data.password), role="user")
    session.add(user)
    try:
        # Flushed first so the new account has its id for the activity row; both are committed together.
        session.flush()
        activity_service.record(session, ActivityEvent.SIGNUP, client, actor=user)
        session.commit()
    except IntegrityError as exc:
        # Two sign-ups with the same email at the same moment: the unique index lets only one through.
        session.rollback()
        raise EmailTakenError(email) from exc
    session.refresh(user)
    return user


def _log_failed_login(session: Session, client: Client, email: str, user: User | None, reason: str) -> None:
    """A failed login names the email that was typed, and the account when one has that email. The caller commits."""
    activity_service.record(session, ActivityEvent.LOGIN_FAILED, client, actor=user, actor_email=email, details=reason)


def _locked_until(user: User) -> datetime | None:
    """When the account's lockout ends, or None if it is not locked (or the lockout has run out)."""
    if user.locked_until is None:
        return None
    until = as_utc(user.locked_until)
    return until if until > utc_now() else None


def _count_wrong_password(session: Session, user: User, client: Client) -> None:
    """Count a wrong password; the 5th in a row locks the account and starts the count again. The caller has already
    added its activity row, which is saved here."""
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
        minutes = int(LOCKOUT.total_seconds() // 60)
        activity_service.record(
            session,
            ActivityEvent.ACCOUNT_LOCKED,
            client,
            target=user,
            details=f"{MAX_FAILED_LOGINS} wrong passwords in a row; logins blocked for {minutes} minutes",
        )
        session.commit()
        raise AccountLockedError(as_utc(user.locked_until))


def _unknown_email_lock(session: Session, email: str) -> datetime | None:
    """An email with no account has no row to count on, so its wrong attempts are counted in the activity log: the
    same 5 in 15 minutes as an account has. Without this, only a real account would ever answer 429, and the answer
    would tell a stranger which emails have an account. Returns when the block ends, or None if it is not blocked."""
    recent = session.exec(
        select(ActivityLog.created_at)
        .where(
            col(ActivityLog.event) == ActivityEvent.LOGIN_FAILED.value,
            col(ActivityLog.actor_email) == email,
            col(ActivityLog.details) == NO_ACCOUNT_REASON,
            col(ActivityLog.created_at) >= utc_now() - LOCKOUT,
        )
        .order_by(col(ActivityLog.created_at).desc())
        .limit(MAX_FAILED_LOGINS)
    ).all()
    # Like an account, the block ends LOCKOUT after the 5th wrong attempt, and attempts made while blocked do not extend it.
    return as_utc(recent[0]) + LOCKOUT if len(recent) >= MAX_FAILED_LOGINS else None


def _count_unknown_email(session: Session, email: str, client: Client) -> None:
    """The caller has added its activity row; this saves it and, on the 5th in a row, records the lockout."""
    session.commit()
    until = _unknown_email_lock(session, email)
    if until is not None:
        minutes = int(LOCKOUT.total_seconds() // 60)
        activity_service.record(
            session,
            ActivityEvent.ACCOUNT_LOCKED,
            client,
            target_email=email,
            details=f"{MAX_FAILED_LOGINS} wrong passwords in a row; logins blocked for {minutes} minutes",
        )
        session.commit()
        raise AccountLockedError(until)


def authenticate(session: Session, data: LoginRequest, client: Client) -> User:
    email = data.email.lower()
    user = _find_by_email(session, email)
    if user is None and (until := _unknown_email_lock(session, email)) is not None:
        _log_failed_login(session, client, email, None, "Account is locked")
        session.commit()
        raise AccountLockedError(until)
    # A locked account is refused before the password is checked, so even the right password waits.
    if user is not None and (until := _locked_until(user)) is not None:
        _log_failed_login(session, client, email, user, "Account is locked")
        session.commit()
        raise AccountLockedError(until)
    # With no user this still checks a dummy hash, so both failures take about the same time.
    password_ok = verify_password(data.password, user.password_hash if user else None)
    if user is None or not password_ok:
        if user is None:
            _log_failed_login(session, client, email, None, NO_ACCOUNT_REASON)
            _count_unknown_email(session, email, client)
        else:
            _log_failed_login(session, client, email, user, "Wrong password")
            _count_wrong_password(session, user, client)
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
        _log_failed_login(session, client, email, user, "Account is banned")
        session.commit()
        raise AccountBannedError
    return user


def _log_failed_change(session: Session, user: User, client: Client, reason: str) -> None:
    activity_service.record(session, ActivityEvent.PASSWORD_CHANGE_FAILED, client, actor=user, details=reason)
    session.commit()


def change_password(
    session: Session, user: User, current_password: str, new_password: str, current_session_id: int, client: Client
) -> None:
    """Every other session of the user is revoked in the same transaction (FR-41); the one making the change stays
    logged in. Also ends the must-change-password state an admin reset leaves. Every refused attempt is recorded, and
    wrong current passwords count towards the lockout, so a stolen login cannot be used to guess the password."""
    if (until := _locked_until(user)) is not None:
        _log_failed_change(session, user, client, "Account is locked")
        raise AccountLockedError(until)
    if not verify_password(current_password, user.password_hash):
        activity_service.record(
            session, ActivityEvent.PASSWORD_CHANGE_FAILED, client, actor=user, details="Current password was wrong"
        )
        _count_wrong_password(session, user, client)
        raise WrongPasswordError
    if not MIN_PASSWORD_LENGTH <= len(new_password) <= MAX_PASSWORD_LENGTH:
        _log_failed_change(session, user, client, "New password was too short or too long")
        raise PasswordLengthError
    if verify_password(new_password, user.password_hash):
        _log_failed_change(session, user, client, "New password was the same as the current one")
        raise SamePasswordError
    user.password_hash = hash_password(new_password)
    user.password_changed_at = utc_now()
    user.must_change_password = False
    user.failed_login_count = 0
    session.add(user)
    ended = session_service.revoke_all(session, user.id, keep=current_session_id)
    activity_service.record(
        session, ActivityEvent.PASSWORD_CHANGE, client, actor=user, details=f"Other sessions logged out: {ended}"
    )
    session.commit()
