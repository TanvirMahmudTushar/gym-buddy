# Member business rules and database queries, used by the routes in app/routers/members.py (TDD 4).
# A member is a user whose account has a membership (a plan); there is no separate member table.
from typing import Literal

from sqlmodel import Session, col, delete, func, select, update

from app.models import CheckIn, ClassBooking, GymClass, MemberCreate, Payment, User, utc_today

MemberStatus = Literal["active", "expired", "frozen"]

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


def get_own_membership(user: User) -> User:
    """The logged-in user, if they have a membership. A user can only ever reach their own."""
    if user.plan is None:
        raise NoMembershipError
    return user


def own_member_id(user: User) -> int | None:
    return user.id if user.plan is not None else None


def start_membership(session: Session, data: MemberCreate) -> User:
    """Give an existing account a membership. The person signs up first; their name comes from the account."""
    user = session.exec(select(User).where(User.email == data.email.lower())).first()
    if user is None:
        raise AccountNotFoundError(data.email)
    if user.plan is not None:
        raise AlreadyMemberError(user.id)
    user.plan = data.plan
    user.joined_on = data.joined_on or utc_today()
    user.expires_on = data.expires_on
    user.is_frozen = False
    user.phone = data.phone
    user.notes = data.notes
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def get_member(session: Session, member_id: int) -> User:
    member = session.get(User, member_id)
    if member is None or member.plan is None:
        raise MemberNotFoundError(member_id)
    return member


def _status_filters(status: MemberStatus | None) -> list:
    """A frozen member counts as frozen whatever its expiry date."""
    today = utc_today()
    if status == "active":
        return [col(User.is_frozen).is_(False), col(User.expires_on) >= today]
    if status == "expired":
        return [col(User.is_frozen).is_(False), col(User.expires_on) < today]
    if status == "frozen":
        return [col(User.is_frozen).is_(True)]
    return []


def list_members(session: Session, status: MemberStatus | None, offset: int, limit: int) -> tuple[list[User], int]:
    """One page of members, newest membership first, plus how many members match the filter in total."""
    filters = [IS_MEMBER, *_status_filters(status)]
    total = session.exec(select(func.count()).select_from(User).where(*filters)).one()
    query = (
        select(User)
        .where(*filters)
        .order_by(col(User.joined_on).desc(), col(User.id).desc())
        .offset(offset)
        .limit(limit)
    )
    return list(session.exec(query).all()), total


def update_member(session: Session, member_id: int, changes: dict) -> User:
    """Apply only the given fields. A later expires_on renews; is_frozen true / false freezes / unfreezes."""
    member = get_member(session, member_id)
    if "expires_on" in changes and changes["expires_on"] < member.joined_on:
        raise InvalidExpiryError("expires_on must be on or after joined_on")
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
    # Check-ins and bookings go first: the database cascades too, but SQLite does not enforce that by default.
    session.exec(delete(CheckIn).where(col(CheckIn.member_id).in_(ids)))
    session.exec(delete(ClassBooking).where(col(ClassBooking.member_id).in_(ids)))
    # Payments are kept (the revenue is real), only detached from the deleted member.
    session.exec(update(Payment).where(col(Payment.member_id).in_(ids)).values(member_id=None))
    # Someone demoted from staff may have recorded check-ins or payments or created classes; those stay, unattributed.
    session.exec(update(CheckIn).where(col(CheckIn.recorded_by).in_(ids)).values(recorded_by=None))
    session.exec(update(Payment).where(col(Payment.recorded_by).in_(ids)).values(recorded_by=None))
    session.exec(update(Payment).where(col(Payment.voided_by).in_(ids)).values(voided_by=None))
    session.exec(update(GymClass).where(col(GymClass.created_by).in_(ids)).values(created_by=None))
    return session.exec(delete(User).where(col(User.id).in_(ids))).rowcount


def delete_member(session: Session, member_id: int) -> None:
    """Deletes the member's whole account: they can no longer log in."""
    member = get_member(session, member_id)
    _check_deletable(member)
    _delete_accounts(session, [member_id])
    session.commit()


def bulk_delete_members(session: Session, ids: list[int]) -> int:
    """All in one transaction. An ID that is not a member is skipped, so the count can be lower than len(ids).
    If any of them is a staff account, nothing is deleted."""
    members = session.exec(select(User).where(col(User.id).in_(ids), IS_MEMBER)).all()
    for member in members:
        _check_deletable(member)
    deleted = _delete_accounts(session, [m.id for m in members]) if members else 0
    session.commit()
    return deleted
