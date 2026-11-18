# Member business rules and database queries, used by the routes in app/routers/members.py (TDD 4).
from typing import Literal

from sqlmodel import Session, col, delete, func, select

from app.models import CheckIn, Member, MemberCreate, utc_now, utc_today

MemberStatus = Literal["active", "expired", "frozen"]


class MemberNotFoundError(Exception):
    """No member has the given ID."""


class InvalidExpiryError(Exception):
    """expires_on is before the member's joined_on date."""


def create_member(session: Session, data: MemberCreate) -> Member:
    # Fields left out (such as joined_on) fall back to the table defaults.
    member = Member(**data.model_dump(exclude_none=True))
    session.add(member)
    session.commit()
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
    member.sqlmodel_update(changes)
    member.updated_at = utc_now()
    session.add(member)
    session.commit()
    session.refresh(member)
    return member


def delete_member(session: Session, member_id: int) -> None:
    member = get_member(session, member_id)
    # Check-ins go first: the database cascades too, but SQLite does not enforce that by default.
    session.exec(delete(CheckIn).where(col(CheckIn.member_id) == member_id))
    session.delete(member)
    session.commit()


def bulk_delete_members(session: Session, ids: list[int]) -> int:
    """All in one transaction. An ID that no longer exists is skipped, so the count can be lower than len(ids)."""
    session.exec(delete(CheckIn).where(col(CheckIn.member_id).in_(ids)))
    result = session.exec(delete(Member).where(col(Member.id).in_(ids)))
    session.commit()
    return result.rowcount
