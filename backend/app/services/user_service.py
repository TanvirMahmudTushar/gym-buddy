# Looking at users and changing their role or name. Every admin action that changes an account is written to the
# activity log in the same commit (FR-85); one that changes nothing (banning a banned user) is not.
import secrets

from sqlmodel import Session, col, func, select

from app import rbac
from app.models import ActivityEvent, ActivityFilter, CheckIn, ClassBooking, Payment, Role, User, UserFilter, utc_now
from app.rbac import Permission
from app.request_info import Client
from app.security import hash_password
from app.services import (
    activity_service,
    checkin_service,
    class_service,
    group_service,
    payment_service,
    session_service,
    trainer_service,
    workout_service,
)
from app.services.csv_export import describe_filters, to_csv, utc_text
from app.services.search import contains_any


class UserNotFoundError(Exception):
    """No user has the given ID."""


class CannotChangeOwnRoleError(Exception):
    """An admin tried to change their own role, which could leave the system with no admin."""


class CannotBanError(Exception):
    """An admin tried to ban themself or another admin."""


class CannotResetPasswordError(Exception):
    """An admin tried to reset their own password or another admin's. The message says which."""


class CannotRevokeOwnSessionsError(Exception):
    """An admin tried to log themself out everywhere from the Users page (My account does that)."""


# Letters and digits that cannot be mixed up when read aloud or copied by hand (no 0/O, 1/l/I).
TEMPORARY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
TEMPORARY_LENGTH = 12
# How many activity rows the user details show.
RECENT_ACTIVITY = 10
# How many workouts, bookings, visits and payments they show, newest first.
RECENT_RECORDS = 5

# Why a ban is refused, for the single ban (400) and for the bulk ban's skipped list.
BAN_SELF = "You cannot ban yourself"
BAN_ADMIN = "You cannot ban an admin; change their role first"

USERS_CSV_HEADER = [
    "id",
    "name",
    "email",
    "role",
    "status",
    "banned_at_utc",
    "ban_reason",
    "must_change_password",
    "plan",
    "joined_on",
    "expires_on",
    "is_frozen",
    "created_at_utc",
]


def get_user(session: Session, user_id: int) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise UserNotFoundError(user_id)
    return user


def _conditions(f: UserFilter) -> list:
    conditions = []
    if f.q:
        conditions.append(contains_any(f.q, User.name, User.email))
    if f.role:
        conditions.append(col(User.role) == f.role)
    if f.status:
        conditions.append(col(User.is_banned).is_(f.status == "banned"))
    return conditions


def _newest_first(conditions: list):
    return select(User).where(*conditions).order_by(col(User.created_at).desc(), col(User.id).desc())


def list_users(session: Session, f: UserFilter, offset: int, limit: int) -> tuple[list[User], int]:
    """One page of users, newest first, plus how many match. The search, role and status filters combine."""
    conditions = _conditions(f)
    total = session.exec(select(func.count()).select_from(User).where(*conditions)).one()
    return list(session.exec(_newest_first(conditions).offset(offset).limit(limit)).all()), total


def export_csv(session: Session, f: UserFilter, exported_by: User, client: Client) -> str:
    """Every user matching the filters as CSV, newest first, like the list. The download is logged."""
    rows = session.exec(_newest_first(_conditions(f))).all()
    text = to_csv(
        USERS_CSV_HEADER,
        (
            [
                u.id,
                u.name,
                u.email,
                u.role,
                "banned" if u.is_banned else "active",
                utc_text(u.banned_at),
                u.ban_reason,
                u.must_change_password,
                u.plan,
                u.joined_on.isoformat() if u.joined_on else None,
                u.expires_on.isoformat() if u.expires_on else None,
                u.is_frozen if u.plan else None,
                utc_text(u.created_at),
            ]
            for u in rows
        ),
    )
    filters = describe_filters(f.model_dump(exclude_none=True))
    activity_service.record(
        session, ActivityEvent.EXPORT, client, actor=exported_by, details=f"users.csv: {len(rows)} rows; {filters}"
    )
    session.commit()
    return text


def user_detail(session: Session, user_id: int) -> dict:
    """One account for the admin: the account and membership, active logins, how much it has on record, groups and
    the newest activity rows about it."""
    user = get_user(session, user_id)
    recent, _ = activity_service.list_activity(session, ActivityFilter(user_id=user_id), 0, RECENT_ACTIVITY)
    return {
        # Never the password hash: the response schema leaves it out, and it is not even passed on.
        **user.model_dump(exclude={"password_hash"}),
        "sessions": session_service.list_active_sessions(session, user_id),
        "records": record_counts(session, user_id),
        "recent_records": recent_records(session, user_id),
        "groups": group_service.groups_of(session, user_id),
        "recent_activity": recent,
    }


def record_counts(session: Session, user_id: int) -> dict:
    def count(table, column):
        return select(func.count()).select_from(table).where(column == user_id).scalar_subquery()

    visits, bookings, payments = session.exec(
        select(
            count(CheckIn, col(CheckIn.member_id)),
            count(ClassBooking, col(ClassBooking.member_id)),
            count(Payment, col(Payment.member_id)),
        )
    ).one()
    return {
        "visits": visits,
        "bookings": bookings,
        "payments": payments,
        **workout_service.counts_for(session, user_id),
    }


def recent_records(session: Session, user_id: int) -> dict:
    """The newest of each kind of record. Each list comes from the service that owns it."""
    return {
        "workouts": workout_service.list_of_account(session, user_id, RECENT_RECORDS),
        "bookings": class_service.list_newest_bookings(session, user_id, RECENT_RECORDS),
        "visits": checkin_service.list_of_account(session, user_id, RECENT_RECORDS),
        "payments": payment_service.list_of_account(session, user_id, RECENT_RECORDS),
    }


def revoke_sessions(session: Session, acting_admin: User, user_id: int, client: Client) -> int:
    """End every active session of the account: its next request gets 401 and the app shows Log in. Not for your
    own account (My account lists your sessions). Returns how many ended; ending none changes nothing and is not
    logged."""
    if acting_admin.id == user_id:
        raise CannotRevokeOwnSessionsError
    user = get_user(session, user_id)
    ended = session_service.revoke_all(session, user.id)
    if ended:
        activity_service.record(
            session,
            ActivityEvent.SESSION_REVOKE,
            client,
            actor=acting_admin,
            target=user,
            details=f"Every session ended by an admin: {ended}",
        )
        session.commit()
    return ended


def change_role(session: Session, acting_admin: User, user_id: int, role: Role, client: Client) -> User:
    if acting_admin.id == user_id:
        raise CannotChangeOwnRoleError
    user = get_user(session, user_id)
    if user.role == role:
        return user
    # A class's or a member's trainer is always an account that can teach, so an ex-trainer lets go of both.
    teach = Permission.CLASSES_TEACH
    if teach in rbac.permissions_for(user.role) and teach not in rbac.permissions_for(role):
        trainer_service.release_trainer(session, user)
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


def _ban_refusal(acting_admin: User, user: User) -> str | None:
    if user.id == acting_admin.id:
        return BAN_SELF
    if user.role == "admin":
        return BAN_ADMIN
    return None


def _ban(session: Session, acting_admin: User, user: User, reason: str | None, client: Client, note: str = "") -> None:
    """Ban one account and end all its sessions (FR-36), with its activity row. The caller commits."""
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
        details=f"{details}; sessions ended: {ended}{note}",
    )


def _unban(session: Session, acting_admin: User, user: User, client: Client, details: str | None = None) -> None:
    """The role and everything else on the account are kept; the ended sessions stay ended. The caller commits."""
    user.is_banned = False
    user.banned_at = None
    user.ban_reason = None
    session.add(user)
    activity_service.record(session, ActivityEvent.UNBAN, client, actor=acting_admin, target=user, details=details)


def ban_user(session: Session, acting_admin: User, user_id: int, reason: str | None, client: Client) -> User:
    """Banning an already banned user changes nothing, so a double click is harmless. Every session of the user is
    revoked in the same transaction (FR-36), so their refresh cookie stops working too."""
    if acting_admin.id == user_id:
        raise CannotBanError(BAN_SELF)
    user = get_user(session, user_id)
    if (refusal := _ban_refusal(acting_admin, user)) is not None:
        raise CannotBanError(refusal)
    if not user.is_banned:
        _ban(session, acting_admin, user, reason, client)
        session.commit()
        session.refresh(user)
    return user


def unban_user(session: Session, acting_admin: User, user_id: int, client: Client) -> User:
    """The role and everything else on the account are kept."""
    user = get_user(session, user_id)
    if user.is_banned:
        _unban(session, acting_admin, user, client)
        session.commit()
        session.refresh(user)
    return user


def _accounts(session: Session, ids: list[int]) -> tuple[list[int], dict[int, User]]:
    """The ids once each, in the order sent, and the accounts that exist among them."""
    unique = list(dict.fromkeys(ids))
    found = session.exec(select(User).where(col(User.id).in_(unique))).all()
    return unique, {u.id: u for u in found}


def bulk_ban(session: Session, acting_admin: User, ids: list[int], reason: str | None, client: Client) -> dict:
    """Ban every account that can be banned, all in one transaction. Yourself, admins, accounts already banned and
    unknown ids are left alone and listed in `skipped` with the reason, so one admin in the list does not stop the
    others being banned."""
    unique, accounts = _accounts(session, ids)
    banned, skipped = [], []
    for user_id in unique:
        user = accounts.get(user_id)
        if user is None:
            skipped.append({"id": user_id, "name": None, "reason": "No user has this id"})
        elif (refusal := _ban_refusal(acting_admin, user)) is not None:
            skipped.append({"id": user_id, "name": user.name, "reason": refusal})
        elif user.is_banned:
            skipped.append({"id": user_id, "name": user.name, "reason": "Already banned"})
        else:
            _ban(session, acting_admin, user, reason, client, note=f"; bulk ban of {len(unique)}")
            banned.append(user_id)
    session.commit()
    return {"banned": banned, "skipped": skipped}


def bulk_unban(session: Session, acting_admin: User, ids: list[int], reason: str | None, client: Client) -> dict:
    """Unban every banned account in the list, all in one transaction. Accounts that are not banned and unknown ids
    are listed in `skipped`. The reason goes to the activity log."""
    unique, accounts = _accounts(session, ids)
    unbanned, skipped = [], []
    details = f"Reason: {reason}; bulk unban of {len(unique)}" if reason else f"Bulk unban of {len(unique)}"
    for user_id in unique:
        user = accounts.get(user_id)
        if user is None:
            skipped.append({"id": user_id, "name": None, "reason": "No user has this id"})
        elif not user.is_banned:
            skipped.append({"id": user_id, "name": user.name, "reason": "Not banned"})
        else:
            _unban(session, acting_admin, user, client, details)
            unbanned.append(user_id)
    session.commit()
    return {"unbanned": unbanned, "skipped": skipped}


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
