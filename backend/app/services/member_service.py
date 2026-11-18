# Member business rules and database queries, used by the routes in app/routers/members.py (TDD 4).
from typing import Literal

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, delete, func, select, update

from app.models import CheckIn, ClassBooking, Member, MemberCreate, Payment, User, utc_now, utc_today

MemberStatus = Literal["active", "expired", "frozen"]


class MemberNotFoundError(Exception):
    """No member has the given ID."""


class InvalidExpiryError(Exception):
    """expires_on is before the member's joined_on date."""


class AccountNotFoundError(Exception):
    """user_id does not match any account."""


class AccountAlreadyLinkedError(Exception):
    """That account is already linked to a different member."""


class NoMembershipLinkedError(Exception):
    """The logged-in user's account is not linked to any member record."""


def _check_account_link(session: Session, user_id: int, member_id: int | None) -> None:
    if session.get(User, user_id) is None:
        raise AccountNotFoundError(user_id)
    other = session.exec(select(Member).where(col(Member.user_id) == user_id)).first()
    if other is not None and other.id != member_id:
        raise AccountAlreadyLinkedError(user_id)


def _commit_link(session: Session) -> None:
    try:
        session.commit()
    except IntegrityError as exc:
        # Two staff linking the same account at the same moment: the unique index lets only one through.
        session.rollback()
        raise AccountAlreadyLinkedError from exc


def get_own_member(session: Session, user: User) -> Member:
    """The member record linked to this account. A user can only ever reach their own."""
    member = session.exec(select(Member).where(col(Member.user_id) == user.id)).first()
    if member is None:
        raise NoMembershipLinkedError
    return member


def own_member_id(session: Session, user: User) -> int | None:
    return session.exec(select(Member.id).where(col(Member.user_id) == user.id)).first()


def create_member(session: Session, data: MemberCreate) -> Member:
    # Fields left out (such as joined_on) fall back to the table defaults.
    if data.user_id is not None:
        _check_account_link(session, data.user_id, None)
    member = Member(**data.model_dump(exclude_none=True))
    session.add(member)
    _commit_link(session)
    session.refresh(member)
    return member


def get_member(session: Session, member_id: int) -> Member:
    member = session.get(Member, member_id)
    if member is None:
        raise MemberNotFoundError(member_id)
    return member


def _status_filters(status: MemberStatus | None) -> list:
    """A frozen member counts as frozen whatever its expiry date."""
    today = utc_today()
    if status == "active":
        return [col(Member.is_active).is_(True), Member.expires_on >= today]
    if status == "expired":
        return [col(Member.is_active).is_(True), Member.expires_on < today]
    if status == "frozen":
        return [col(Member.is_active).is_(False)]
    return []


def list_members(
    session: Session, status: MemberStatus | None, offset: int, limit: int
) -> tuple[list[Member], int]:
    """One page of members, newest first, plus how many members match the filter in total."""
    filters = _status_filters(status)
    total = session.exec(select(func.count()).select_from(Member).where(*filters)).one()
    query = (
        select(Member)
        .where(*filters)
        .order_by(col(Member.created_at).desc(), col(Member.id).desc())
        .offset(offset)
        .limit(limit)
    )
    return list(session.exec(query).all()), total


def update_member(session: Session, member_id: int, changes: dict) -> Member:
    """Apply only the given fields. A later expires_on renews; is_active false / true freezes / unfreezes."""
    member = get_member(session, member_id)
    if "expires_on" in changes and changes["expires_on"] < member.joined_on:
        raise InvalidExpiryError("expires_on must be on or after joined_on")
    if changes.get("user_id") is not None:
        _check_account_link(session, changes["user_id"], member.id)
    member.sqlmodel_update(changes)
    member.updated_at = utc_now()
    session.add(member)
    _commit_link(session)
    session.refresh(member)
    return member


def delete_member(session: Session, member_id: int) -> None:
    member = get_member(session, member_id)
    # Check-ins go first: the database cascades too, but SQLite does not enforce that by default.
    session.exec(delete(CheckIn).where(col(CheckIn.member_id) == member_id))
    session.exec(delete(ClassBooking).where(col(ClassBooking.member_id) == member_id))
    # Payments are kept (the revenue is real), only detached from the deleted member.
    session.exec(update(Payment).where(col(Payment.member_id) == member_id).values(member_id=None))
    session.delete(member)
    session.commit()


def bulk_delete_members(session: Session, ids: list[int]) -> int:
    """All in one transaction. An ID that no longer exists is skipped, so the count can be lower than len(ids)."""
    session.exec(delete(CheckIn).where(col(CheckIn.member_id).in_(ids)))
    session.exec(delete(ClassBooking).where(col(ClassBooking.member_id).in_(ids)))
    session.exec(update(Payment).where(col(Payment.member_id).in_(ids)).values(member_id=None))
    result = session.exec(delete(Member).where(col(Member.id).in_(ids)))
    session.commit()
    return result.rowcount
