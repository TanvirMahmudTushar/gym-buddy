# Looking at users and changing their role or name. Every admin action that changes an account is written to the
# activity log in the same commit (FR-85); one that changes nothing (banning a banned user) is not.
import secrets

from sqlmodel import Session, col, func, select

from app import rbac
from app.models import ActivityEvent, Role, User, utc_now
from app.rbac import Permission
from app.request_info import Client
from app.security import hash_password
from app.services import activity_service, class_service, session_service
from app.services.search import contains_any


class UserNotFoundError(Exception):
    """No user has the given ID."""


class CannotChangeOwnRoleError(Exception):
    """An admin tried to change their own role, which could leave the system with no admin."""


class CannotBanError(Exception):
    """An admin tried to ban themself or another admin."""


class CannotResetPasswordError(Exception):
    """An admin tried to reset their own password or another admin's. The message says which."""


# Letters and digits that cannot be mixed up when read aloud or copied by hand (no 0/O, 1/l/I).
TEMPORARY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
TEMPORARY_LENGTH = 12


def get_user(session: Session, user_id: int) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise UserNotFoundError(user_id)
    return user


def list_users(session: Session, offset: int, limit: int, q: str | None = None) -> tuple[list[User], int]:
    """One page of users, newest first, plus how many match. q matches part of the name or email."""
    filters = [contains_any(q, User.name, User.email)] if q else []
    total = session.exec(select(func.count()).select_from(User).where(*filters)).one()
    query = (
        select(User)
        .where(*filters)
        .order_by(col(User.created_at).desc(), col(User.id).desc())
        .offset(offset)
        .limit(limit)
    )
    return list(session.exec(query).all()), total


def list_trainers(session: Session) -> list[User]:
    """Every account with the Trainer role, by name: the choices for a class's trainer. A gym has only a few."""
    teachers = rbac.roles_with(Permission.CLASSES_TEACH)
    query = select(User).where(col(User.role).in_(teachers)).order_by(col(User.name), col(User.id))
    return list(session.exec(query).all())


def change_role(session: Session, acting_admin: User, user_id: int, role: Role, client: Client) -> User:
    if acting_admin.id == user_id:
        raise CannotChangeOwnRoleError
    user = get_user(session, user_id)
    if user.role == role:
        return user
    # A class's trainer is always an account that can teach, so classes keep only the name of an ex-trainer.
    teach = Permission.CLASSES_TEACH
    if teach in rbac.permissions_for(user.role) and teach not in rbac.permissions_for(role):
        class_service.release_trainer(session, user)
    activity_service.record(
        session, ActivityEvent.ROLE_CHANGE, client, actor=acting_admin, target=user, details=f"{user.role} → {role}"
    )
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


def ban_user(session: Session, acting_admin: User, user_id: int, reason: str | None, client: Client) -> User:
    """Banning an already banned user changes nothing, so a double click is harmless. Every session of the user is
    revoked in the same transaction (FR-36), so their refresh cookie stops working too."""
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
        ended = session_service.revoke_all(session, user.id)
        details = f"Reason: {reason}" if reason else "No reason given"
        activity_service.record(
            session,
            ActivityEvent.BAN,
            client,
            actor=acting_admin,
            target=user,
            details=f"{details}; sessions ended: {ended}",
        )
        session.commit()
        session.refresh(user)
    return user


def unban_user(session: Session, acting_admin: User, user_id: int, client: Client) -> User:
    """The role and everything else on the account are kept."""
    user = get_user(session, user_id)
    if user.is_banned:
        user.is_banned = False
        user.banned_at = None
        user.ban_reason = None
        session.add(user)
        activity_service.record(session, ActivityEvent.UNBAN, client, actor=acting_admin, target=user)
        session.commit()
        session.refresh(user)
    return user


def reset_password(session: Session, acting_admin: User, user_id: int, client: Client) -> tuple[User, str]:
    """Give the account a random temporary password, which the admin hands over. Every session is revoked, any login
    lockout is cleared, and the account must choose a new password before it can do anything else."""
    if acting_admin.id == user_id:
        raise CannotResetPasswordError("Change your own password on My account")
    user = get_user(session, user_id)
    if user.role == "admin":
        raise CannotResetPasswordError("You cannot reset another admin's password; change their role first")
    temporary = "".join(secrets.choice(TEMPORARY_ALPHABET) for _ in range(TEMPORARY_LENGTH))
    user.password_hash = hash_password(temporary)
    user.password_changed_at = utc_now()
    user.must_change_password = True
    user.failed_login_count = 0
    user.locked_until = None
    session.add(user)
    ended = session_service.revoke_all(session, user.id)
    # The temporary password itself is never logged.
    activity_service.record(
        session,
        ActivityEvent.PASSWORD_RESET,
        client,
        actor=acting_admin,
        target=user,
        details=f"Temporary password issued; sessions ended: {ended}",
    )
    session.commit()
    session.refresh(user)
    return user, temporary
