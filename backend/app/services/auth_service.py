# Sign up and log in. Everyone who signs up is a plain user; only an admin can change a role (user_service).
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.models import LoginRequest, SignupRequest, User, utc_now
from app.security import hash_password, verify_password


class EmailTakenError(Exception):
    """An account with this email already exists."""


ACCOUNT_BANNED_MESSAGE = "Account banned"


class AccountBannedError(Exception):
    """The password is right but an admin has banned this account."""


class WrongPasswordError(Exception):
    """The current password given when changing the password is wrong."""


class InvalidCredentialsError(Exception):
    """Wrong email or wrong password; the two are deliberately not told apart."""


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


def authenticate(session: Session, data: LoginRequest) -> User:
    user = _find_by_email(session, data.email)
    # With no user this still checks a dummy hash, so both failures take about the same time.
    password_ok = verify_password(data.password, user.password_hash if user else None)
    if user is None or not password_ok:
        raise InvalidCredentialsError
    # Checked only after the password, so a stranger cannot find out who is banned.
    if user.is_banned:
        raise AccountBannedError
    return user


def change_password(session: Session, user: User, current_password: str, new_password: str) -> None:
    """Every token issued before this moment stops working (see deps.get_current_user)."""
    if not verify_password(current_password, user.password_hash):
        raise WrongPasswordError
    user.password_hash = hash_password(new_password)
    user.password_changed_at = utc_now()
    session.add(user)
    session.commit()
