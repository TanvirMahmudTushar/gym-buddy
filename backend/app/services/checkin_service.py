# Check-ins: a gym manager or admin records when a member arrives (SRS FR-30 to FR-32).
from datetime import datetime, time, timezone

from sqlmodel import Session, col, func, select

from app.models import CheckIn, Member, User, utc_today
from app.services import member_service


class MembershipNotValidError(Exception):
    """The member is frozen or expired, so they cannot be checked in. The message says which."""


def check_membership_valid(member: Member) -> None:
    if not member.is_active:
        raise MembershipNotValidError("Membership is frozen")
    if member.expires_on < utc_today():
        raise MembershipNotValidError(f"Membership expired on {member.expires_on.isoformat()}")


def start_of_today() -> datetime:
    """Midnight at the start of today, UTC: the same 'today' the expiry check uses (SRS C-7)."""
    return datetime.combine(utc_today(), time.min, tzinfo=timezone.utc)


def _read(check_in: CheckIn, member_name: str, recorded_by_name: str | None) -> dict:
    return {
        "id": check_in.id,
        "member_id": check_in.member_id,
        "member_name": member_name,
        "checked_in_at": check_in.checked_in_at,
        "recorded_by_name": recorded_by_name,
    }


def _page(session: Session, filters: list, offset: int, limit: int) -> tuple[list[dict], int]:
    """Check-ins matching the filters, newest first, with the member's and the recorder's names."""
    total = session.exec(select(func.count()).select_from(CheckIn).where(*filters)).one()
    query = (
        select(CheckIn, Member.full_name, User.name)
        .join(Member, col(CheckIn.member_id) == col(Member.id))
        # Outer join: the check-in stays listed even if the account that recorded it is gone.
        .join(User, col(CheckIn.recorded_by) == col(User.id), isouter=True)
        .where(*filters)
        .order_by(col(CheckIn.checked_in_at).desc(), col(CheckIn.id).desc())
        .offset(offset)
        .limit(limit)
    )
    return [_read(c, member_name, by) for c, member_name, by in session.exec(query).all()], total


def record_check_in(session: Session, member_id: int, recorded_by: User) -> dict:
    """More than one check-in for the same member on the same day is allowed (FR-32)."""
    member = member_service.get_member(session, member_id)
    check_membership_valid(member)
    check_in = CheckIn(member_id=member.id, recorded_by=recorded_by.id)
    session.add(check_in)
    session.commit()
    session.refresh(check_in)
    return _read(check_in, member.full_name, recorded_by.name)


def list_member_check_ins(session: Session, member_id: int, offset: int, limit: int) -> tuple[list[dict], int]:
    member_service.get_member(session, member_id)
    return _page(session, [col(CheckIn.member_id) == member_id], offset, limit)


def list_today(session: Session, offset: int, limit: int) -> tuple[list[dict], int]:
    return _page(session, [col(CheckIn.checked_in_at) >= start_of_today()], offset, limit)


def count_since(session: Session, since: datetime) -> int:
    return session.exec(select(func.count()).select_from(CheckIn).where(col(CheckIn.checked_in_at) >= since)).one()
