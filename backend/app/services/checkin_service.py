# Attendance: a gym manager or admin records when a member arrives and leaves (SRS FR-30 to FR-32).
from datetime import date, datetime, timedelta

from sqlalchemy.orm import aliased
from sqlmodel import Session, col, func, select

from app.models import CheckIn, User, as_utc, start_of_day, utc_now, utc_today
from app.services import member_service
from app.services.search import contains_any


class MembershipNotValidError(Exception):
    """The member is frozen or expired, so they cannot be checked in. The message says which."""


class AlreadyInsideError(Exception):
    """The member is checked in today and not checked out yet."""


class CheckInNotFoundError(Exception):
    """No check-in has the given ID."""


class CannotCheckOutError(Exception):
    """This visit is already checked out, or is from an earlier day. The message says which."""


# The user who recorded a check-in, joined next to the member (also a user) who arrived.
Recorder = aliased(User)


def check_membership_valid(member: User) -> None:
    if member.is_frozen:
        raise MembershipNotValidError("Membership is frozen")
    if member.expires_on < utc_today():
        raise MembershipNotValidError(f"Membership expired on {member.expires_on.isoformat()}")


def start_of_today() -> datetime:
    """Midnight at the start of today, UTC: the same 'today' the expiry check uses (SRS C-7)."""
    return start_of_day(utc_today())


def _inside() -> list:
    """Inside the gym now: checked in today and not checked out. A visit left open on an earlier day is over."""
    return [col(CheckIn.checked_out_at).is_(None), col(CheckIn.checked_in_at) >= start_of_today()]


def _read(check_in: CheckIn, member_name: str, recorded_by_name: str | None) -> dict:
    return {
        "id": check_in.id,
        "member_id": check_in.member_id,
        "member_name": member_name,
        "checked_in_at": check_in.checked_in_at,
        "checked_out_at": check_in.checked_out_at,
        "recorded_by_name": recorded_by_name,
    }


def _page(session: Session, filters: list, offset: int, limit: int) -> tuple[list[dict], int]:
    """Check-ins matching the filters, newest first, with the member's and the recorder's names."""
    total = session.exec(
        select(func.count()).select_from(CheckIn).join(User, col(CheckIn.member_id) == col(User.id)).where(*filters)
    ).one()
    query = (
        select(CheckIn, User.name, Recorder.name)
        .join(User, col(CheckIn.member_id) == col(User.id))
        # Outer join: the check-in stays listed even if the account that recorded it is gone.
        .join(Recorder, col(CheckIn.recorded_by) == col(Recorder.id), isouter=True)
        .where(*filters)
        .order_by(col(CheckIn.checked_in_at).desc(), col(CheckIn.id).desc())
        .offset(offset)
        .limit(limit)
    )
    return [_read(c, member_name, by) for c, member_name, by in session.exec(query).all()], total


def record_check_in(session: Session, member_id: int, recorded_by: User) -> dict:
    """A member can come back the same day, but has to be checked out before being checked in again (FR-32)."""
    member = member_service.get_member(session, member_id)
    check_membership_valid(member)
    # A gym's front desk does one check-in at a time, so this read is enough; a double click is refused.
    if session.exec(select(CheckIn.id).where(col(CheckIn.member_id) == member.id, *_inside()).limit(1)).first():
        raise AlreadyInsideError(f"{member.name} is already checked in")
    check_in = CheckIn(member_id=member.id, recorded_by=recorded_by.id)
    session.add(check_in)
    session.commit()
    session.refresh(check_in)
    return _read(check_in, member.name, recorded_by.name)


def list_member_check_ins(session: Session, member_id: int, offset: int, limit: int) -> tuple[list[dict], int]:
    member_service.get_member(session, member_id)
    return _page(session, [col(CheckIn.member_id) == member_id], offset, limit)


def check_out(session: Session, check_in_id: int) -> dict:
    """Record that the member left, now. A visit left open on an earlier day stays open: when they really left is
    not known any more."""
    check_in = session.get(CheckIn, check_in_id)
    if check_in is None:
        raise CheckInNotFoundError(check_in_id)
    if check_in.checked_out_at is not None:
        raise CannotCheckOutError("This visit is already checked out")
    if as_utc(check_in.checked_in_at) < start_of_today():
        raise CannotCheckOutError("This visit is from an earlier day, so it can no longer be checked out")
    check_in.checked_out_at = utc_now()
    session.add(check_in)
    session.commit()
    row, _ = _page(session, [col(CheckIn.id) == check_in_id], 0, 1)
    return row[0]


def list_day(
    session: Session, day: date, inside: bool, q: str | None, offset: int, limit: int
) -> tuple[list[dict], int]:
    """Everyone checked in on a UTC day, newest first. inside narrows it to who is in the gym now."""
    filters = [
        col(CheckIn.checked_in_at) >= start_of_day(day),
        col(CheckIn.checked_in_at) < start_of_day(day + timedelta(days=1)),
    ]
    if inside:
        filters += _inside()
    if q:
        filters.append(contains_any(q, User.name, User.email, User.phone))
    return _page(session, filters, offset, limit)


def count_inside(session: Session) -> int:
    return session.exec(select(func.count()).select_from(CheckIn).where(*_inside())).one()


def count_by_day(session: Session, days: int) -> list[dict]:
    """Check-ins on each of the last `days` UTC days, oldest first. One small query per day keeps this the same on
    SQLite and PostgreSQL (no date functions in SQL)."""
    counts = []
    for back in range(days - 1, -1, -1):
        day = utc_today() - timedelta(days=back)
        between = [
            col(CheckIn.checked_in_at) >= start_of_day(day),
            col(CheckIn.checked_in_at) < start_of_day(day + timedelta(days=1)),
        ]
        counts.append(
            {"day": day, "count": session.exec(select(func.count()).select_from(CheckIn).where(*between)).one()}
        )
    return counts


def count_since(session: Session, since: datetime) -> int:
    return session.exec(select(func.count()).select_from(CheckIn).where(col(CheckIn.checked_in_at) >= since)).one()
