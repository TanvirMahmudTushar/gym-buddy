# Looking at users and changing their role or name.
from sqlmodel import Session, col, func, select

from app.models import Role, User, utc_now


class UserNotFoundError(Exception):
    """No user has the given ID."""


class CannotChangeOwnRoleError(Exception):
    """An admin tried to change their own role, which could leave the system with no admin."""


class CannotBanError(Exception):
    """An admin tried to ban themself or another admin."""


def get_user(session: Session, user_id: int) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise UserNotFoundError(user_id)
    return user


def list_users(session: Session, offset: int, limit: int) -> tuple[list[User], int]:
    """One page of users, newest first, plus the total number of users."""
    total = session.exec(select(func.count()).select_from(User)).one()
    query = select(User).order_by(col(User.created_at).desc(), col(User.id).desc()).offset(offset).limit(limit)
    return list(session.exec(query).all()), total


def change_role(session: Session, acting_admin: User, user_id: int, role: Role) -> User:
    if acting_admin.id == user_id:
        raise CannotChangeOwnRoleError
    user = get_user(session, user_id)
    user.role = role
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def rename_user(session: Session, user: User, name: str) -> User:
    user.name = name
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def ban_user(session: Session, acting_admin: User, user_id: int, reason: str | None) -> User:
    """Banning an already banned user changes nothing, so a double click is harmless."""
    if acting_admin.id == user_id:
        raise CannotBanError("You cannot ban yourself")
    user = get_user(session, user_id)
    if user.role == "admin":
        raise CannotBanError("You cannot ban an admin; change their role first")
    if not user.is_banned:
        user.is_banned = True
        user.banned_at = utc_now()
        user.ban_reason = reason or None
        session.add(user)
        session.commit()
        session.refresh(user)
    return user


def unban_user(session: Session, user_id: int) -> User:
    """The role and everything else on the account are kept."""
    user = get_user(session, user_id)
    if user.is_banned:
        user.is_banned = False
        user.banned_at = None
        user.ban_reason = None
        session.add(user)
        session.commit()
        session.refresh(user)
    return user


def find_account(session: Session, email: str | None, user_id: int | None) -> User:
    """Staff use this to find the account to link to a member: by exact email, or by ID."""
    if user_id is not None:
        return get_user(session, user_id)
    user = session.exec(select(User).where(User.email == (email or "").strip().lower())).first()
    if user is None:
        raise UserNotFoundError(email)
    return user
