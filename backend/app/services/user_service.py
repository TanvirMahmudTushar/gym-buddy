# Looking at users and changing their role or name.
from sqlmodel import Session, col, func, select

from app.models import Role, User


class UserNotFoundError(Exception):
    """No user has the given ID."""


class CannotChangeOwnRoleError(Exception):
    """An admin tried to change their own role, which could leave the system with no admin."""


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
