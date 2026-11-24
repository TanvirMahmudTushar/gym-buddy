# Member business rules and database queries, used by the routes in app/routers/members.py (TDD 4).
# A member is a user whose account has a membership (a plan); there is no separate member table.
from datetime import timedelta
from typing import Literal

from sqlmodel import Session, col, delete, func, select, update

from app.models import (
    ActivityEvent,
    ActivityLog,
    Announcement,
    AuthSession,
    CheckIn,
    ClassBooking,
    Equipment,
    Expense,
    GymClass,
    MemberCreate,
    Payment,
    User,
    utc_today,
)
from app.request_info import Client
from app.services import activity_service, group_service, plan_service, profile_service, trainer_service
from app.services.search import contains_any

# expiring_soon is a part of active: memberships that end today or within the next EXPIRING_SOON_DAYS days.
MemberStatus = Literal["active", "expired", "frozen", "expiring_soon"]
EXPIRING_SOON_DAYS = 7

# The SQL condition "this account has a membership".
IS_MEMBER = col(User.plan).is_not(None)


class MemberNotFoundError(Exception):
    """No user with a membership has the given ID."""


class InvalidExpiryError(Exception):
    """expires_on is before the member's joined_on date."""


class AccountNotFoundError(Exception):
    """No account has the email a membership was started for."""


class AlreadyMemberError(Exception):
    """That account already has a membership."""


class NoMembershipError(Exception):
    """The logged-in user has no membership yet."""


class CannotDeleteAccountError(Exception):
    """Only a plain User's account can be deleted from the members page. The message says why not."""


def read_many(session: Session, members: list[User]) -> list[dict]:
    """The members with their personal trainers' names (MemberRead), all names in one query."""
    trainer_ids = {m.trainer_id for m in members if m.trainer_id is not None}
    names = dict(session.exec(select(User.id, User.name).where(col(User.id).in_(trainer_ids))).all()) if trainer_ids else {}
    return [
        {**m.model_dump(exclude={"password_hash"}), "trainer_name": names.get(m.trainer_id)} for m in members
    ]


def read(session: Session, member: User) -> dict:
    return read_many(session, [member])[0]


def get_own_membership(user: User) -> User:
    """The logged-in user, if they have a membership. A user can only ever reach their own."""
    if user.plan is None:
        raise NoMembershipError
    return user


def own_member_id(user: User) -> int | None:
    return user.id if user.plan is not None else None


def start_membership(session: Session, data: MemberCreate, recorded_by: User) -> User:
    """Give an existing account a membership. The person signs up first; their name comes from the account.
    With payment_method, the plan's price is recorded as their first payment in the same transaction."""
    user = session.exec(select(User).where(User.email == data.email.lower())).first()
    if user is None:
        raise AccountNotFoundError(data.email)
    if user.plan is not None:
        raise AlreadyMemberError(user.id)
    plan = plan_service.get_offered(session, data.plan)
    if data.trainer_id is not None:
        trainer_service.check_trainer(session, data.trainer_id)
    user.plan = plan.plan
    user.joined_on = data.joined_on or utc_today()
    user.expires_on = data.expires_on or user.joined_on + timedelta(days=plan.duration_days)
    user.is_frozen = False
    user.trainer_id = data.trainer_id
    # The person may have saved a phone on My account already; leaving it empty here keeps that one.
    if data.phone:
        user.phone = data.phone
    user.notes = data.notes
    session.add(user)
    if data.payment_method:
        session.add(
            Payment(
                member_id=user.id,
                member_name=user.name,
                amount=plan.price,
                method=data.payment_method,
                plan=plan.plan,
                note="New membership",
                renewed_until=user.expires_on,
                recorded_by=recorded_by.id,
            )
        )
    session.commit()
    session.refresh(user)
    return user


def get_member(session: Session, member_id: int) -> User:
    member = session.get(User, member_id)
    if member is None or member.plan is None:
        raise MemberNotFoundError(member_id)
    return member


def status_filters(status: MemberStatus | None) -> list:
    """A frozen member counts as frozen whatever its expiry date."""
    today = utc_today()
    not_frozen = col(User.is_frozen).is_(False)
    if status == "active":
        return [not_frozen, col(User.expires_on) >= today]
    if status == "expired":
        return [not_frozen, col(User.expires_on) < today]
    if status == "frozen":
        return [col(User.is_frozen).is_(True)]
    if status == "expiring_soon":
        # Both ends included: a membership ending today still counts, and so does one ending in exactly 7 days.
        return [
            not_frozen,
            col(User.expires_on) >= today,
            col(User.expires_on) <= today + timedelta(days=EXPIRING_SOON_DAYS),
        ]
    return []


def list_members(
    session: Session, status: MemberStatus | None, offset: int, limit: int, q: str | None = None
) -> tuple[list[User], int]:
    """One page of members plus how many match the filter in total. Newest membership first, except
    expiring_soon, which lists the soonest expiry first (the people to call first). q matches part of the
    name, email or phone."""
    filters = [IS_MEMBER, *status_filters(status)]
    if q:
        filters.append(contains_any(q, User.name, User.email, User.phone))
    total = session.exec(select(func.count()).select_from(User).where(*filters)).one()
    if status == "expiring_soon":
        order = (col(User.expires_on), col(User.id))
    else:
        order = (col(User.joined_on).desc(), col(User.id).desc())
    query = select(User).where(*filters).order_by(*order).offset(offset).limit(limit)
    return list(session.exec(query).all()), total


# Accounts that signed up as a User but have no membership yet: the people to start one for.
WAITING = [col(User.role) == "user", col(User.plan).is_(None)]


def list_waiting(session: Session, offset: int, limit: int, q: str | None = None) -> tuple[list[User], int]:
    """One page of accounts waiting for a membership, newest sign-up first. q matches part of the name or email."""
    filters = list(WAITING)
    if q:
        filters.append(contains_any(q, User.name, User.email))
    total = session.exec(select(func.count()).select_from(User).where(*filters)).one()
    query = select(User).where(*filters).order_by(col(User.created_at).desc(), col(User.id).desc())
    return list(session.exec(query.offset(offset).limit(limit)).all()), total


def update_member(session: Session, member_id: int, changes: dict) -> User:
    """Apply only the given fields. A later expires_on renews; is_frozen true / false freezes / unfreezes.
    The contact and safety details follow the same rules as the member's own edits (profile_service)."""
    member = get_member(session, member_id)
    if "expires_on" in changes and changes["expires_on"] < member.joined_on:
        raise InvalidExpiryError("expires_on must be on or after joined_on")
    profile_service.check_emergency_contact(member, changes)
    # A member on a retired plan keeps it; changing to a plan needs one that is still offered.
    if "plan" in changes and changes["plan"] != member.plan:
        plan_service.get_offered(session, changes["plan"])
    if changes.get("trainer_id") is not None:
        trainer_service.check_trainer(session, changes["trainer_id"])
    member.sqlmodel_update(changes)
    session.add(member)
    session.commit()
    session.refresh(member)
    return member


def _check_deletable(member: User) -> None:
    # Staff accounts are never deleted here (this also stops anyone deleting themself): an admin changes the role first.
    if member.role != "user":
        raise CannotDeleteAccountError(f"{member.name} is staff; only a User's account can be deleted here")


def _delete_accounts(session: Session, ids: list[int]) -> int:
    """Delete these accounts and what belongs to them. The caller commits."""
    # Their groups (group_service.delete_for_accounts() says what is kept).
    group_service.delete_for_accounts(session, ids)
    # Sessions, check-ins and bookings go first: the database cascades too, but SQLite does not enforce that by default.
    session.exec(delete(AuthSession).where(col(AuthSession.user_id).in_(ids)))
    session.exec(delete(CheckIn).where(col(CheckIn.member_id).in_(ids)))
    session.exec(delete(ClassBooking).where(col(ClassBooking.member_id).in_(ids)))
    # Payments are kept (the revenue is real), only detached from the deleted member.
    session.exec(update(Payment).where(col(Payment.member_id).in_(ids)).values(member_id=None))
    # Someone demoted from staff may have recorded check-ins, payments or expenses, created classes, posted
    # announcements, reported a fault or trained members; those stay, unattributed.
    session.exec(update(User).where(col(User.trainer_id).in_(ids)).values(trainer_id=None))
    session.exec(update(Expense).where(col(Expense.recorded_by).in_(ids)).values(recorded_by=None))
    session.exec(update(Equipment).where(col(Equipment.reported_by).in_(ids)).values(reported_by=None))
    session.exec(update(CheckIn).where(col(CheckIn.recorded_by).in_(ids)).values(recorded_by=None))
    session.exec(update(Payment).where(col(Payment.recorded_by).in_(ids)).values(recorded_by=None))
    session.exec(update(Payment).where(col(Payment.voided_by).in_(ids)).values(voided_by=None))
    session.exec(update(GymClass).where(col(GymClass.created_by).in_(ids)).values(created_by=None))
    session.exec(update(Announcement).where(col(Announcement.posted_by).in_(ids)).values(posted_by=None))
    # The activity log keeps its rows about these accounts; they still name them by the email copied into each row.
    session.exec(update(ActivityLog).where(col(ActivityLog.actor_id).in_(ids)).values(actor_id=None))
    session.exec(update(ActivityLog).where(col(ActivityLog.target_id).in_(ids)).values(target_id=None))
    return session.exec(delete(User).where(col(User.id).in_(ids))).rowcount


def _log_deletes(session: Session, members: list[User], actor: User, client: Client, how: str) -> None:
    """One row per deleted account. The account is gone, so the row keeps only its email (and the name in details)."""
    for member in members:
        activity_service.record(
            session,
            ActivityEvent.ACCOUNT_DELETE,
            client,
            actor=actor,
            target_email=member.email,
            details=f"{member.name}; {how}",
        )


def delete_member(session: Session, member_id: int, actor: User, client: Client) -> None:
    """Deletes the member's whole account: they can no longer log in."""
    member = get_member(session, member_id)
    _check_deletable(member)
    _log_deletes(session, [member], actor, client, "deleted on the Members page")
    _delete_accounts(session, [member_id])
    session.commit()


def bulk_delete_members(session: Session, ids: list[int], actor: User, client: Client) -> int:
    """All in one transaction. An ID that is not a member is skipped, so the count can be lower than len(ids).
    If any of them is a staff account, nothing is deleted."""
    members = list(session.exec(select(User).where(col(User.id).in_(ids), IS_MEMBER)).all())
    for member in members:
        _check_deletable(member)
    _log_deletes(session, members, actor, client, f"bulk delete of {len(members)}")
    deleted = _delete_accounts(session, [m.id for m in members]) if members else 0
    session.commit()
    return deleted
