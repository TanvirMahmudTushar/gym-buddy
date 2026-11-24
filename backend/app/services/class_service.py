# Classes, their bookings and who attended: what a gym manager runs (SRS FR-25 to FR-28),
# and the classes a trainer teaches (FR-69 to FR-71).
from datetime import timedelta
from typing import Literal

from sqlalchemy import exists, false
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, delete, func, select

from app import rbac
from app.models import ClassBooking, ClassCreate, GymClass, User, as_utc, utc_now
from app.rbac import Permission
from app.services import checkin_service, trainer_service

# Attendance can be marked from this long before the class starts (people arrive early), and any time after.
ATTENDANCE_OPENS = timedelta(hours=1)


class ClassNotFoundError(Exception):
    """No class has the given ID."""


class CapacityBelowBookingsError(Exception):
    """The new capacity is lower than the number of members who already booked."""


class ClassStartedError(Exception):
    """The class has already started, so it can no longer be booked or cancelled."""


class ClassFullError(Exception):
    """Every place in the class is taken."""


class AlreadyBookedError(Exception):
    """This member already booked this class."""


class BookingNotFoundError(Exception):
    """This member has no booking for this class."""


class AttendanceNotOpenError(Exception):
    """The class is still more than an hour away, so nobody can have attended it."""


class MemberNotBookedError(Exception):
    """That member has no booking for this class."""


class NotYourClassError(Exception):
    """A trainer asked for the bookings of a class they do not teach."""


# Upcoming: not started yet, soonest first. Past: started, latest first.
# Shared by a member's bookings and a trainer's classes.
When = Literal["upcoming", "past"]

# Used with an outer join on the trainer's account: a linked trainer shows their current name, and a class from
# before trainers were accounts keeps its text name (choosing a trainer clears it, so only one of the two is set).
_TRAINER_NAME = func.coalesce(col(User.name), col(GymClass.trainer_name))
_TRAINER_JOIN = col(GymClass.trainer_id) == col(User.id)


def _when_filter(when: When):
    now = utc_now()
    return col(GymClass.starts_at) >= now if when == "upcoming" else col(GymClass.starts_at) < now


def _when_order(when: When):
    return col(GymClass.starts_at) if when == "upcoming" else col(GymClass.starts_at).desc()


def _booked_by(member_id: int | None):
    """True for classes the given member booked; always false when there is no member."""
    if member_id is None:
        return false()
    return (
        exists()
        .where(col(ClassBooking.class_id) == col(GymClass.id), col(ClassBooking.member_id) == member_id)
        .correlate(GymClass)
    )


def _booked_count():
    """A subquery giving each class's number of bookings."""
    return (
        select(func.count())
        .select_from(ClassBooking)
        .where(col(ClassBooking.class_id) == col(GymClass.id))
        .correlate(GymClass)
        .scalar_subquery()
    )


def _read(gym_class: GymClass, trainer_name: str | None, booked_count: int, booked_by_me: bool = False) -> dict:
    return {
        **gym_class.model_dump(exclude={"created_by"}),
        "trainer_name": trainer_name,
        "booked_count": booked_count,
        "is_booked_by_me": booked_by_me,
    }


def _trainer_name(session: Session, gym_class: GymClass) -> str | None:
    """The trainer name one class shows; the lists get it from _TRAINER_NAME in the same query instead."""
    if gym_class.trainer_id is None:
        return gym_class.trainer_name
    trainer = session.get(User, gym_class.trainer_id)
    return trainer.name if trainer else None


def _get(session: Session, class_id: int) -> GymClass:
    gym_class = session.get(GymClass, class_id)
    if gym_class is None:
        raise ClassNotFoundError(class_id)
    return gym_class


def _count_bookings(session: Session, class_id: int) -> int:
    return session.exec(select(func.count()).select_from(ClassBooking).where(col(ClassBooking.class_id) == class_id)).one()


def create_class(session: Session, data: ClassCreate, created_by: User) -> dict:
    if data.trainer_id is not None:
        trainer_service.check_trainer(session, data.trainer_id)
    gym_class = GymClass(**data.model_dump(), created_by=created_by.id)
    session.add(gym_class)
    session.commit()
    session.refresh(gym_class)
    return _read(gym_class, _trainer_name(session, gym_class), 0)


def get_class(session: Session, class_id: int, member_id: int | None = None) -> dict:
    gym_class = _get(session, class_id)
    booked_by_me = member_id is not None and session.get(ClassBooking, (class_id, member_id)) is not None
    return _read(gym_class, _trainer_name(session, gym_class), _count_bookings(session, class_id), booked_by_me)


def _page(
    session: Session, filters: list, order, offset: int, limit: int, member_id: int | None
) -> tuple[list[dict], int]:
    """One page of the classes matching the filters, each with its trainer's name and number of bookings."""
    total = session.exec(select(func.count()).select_from(GymClass).where(*filters)).one()
    query = (
        select(GymClass, _TRAINER_NAME, _booked_count(), _booked_by(member_id))
        .outerjoin(User, _TRAINER_JOIN)
        .where(*filters)
        .order_by(order, col(GymClass.id))
        .offset(offset)
        .limit(limit)
    )
    return [_read(c, trainer, booked, bool(mine)) for c, trainer, booked, mine in session.exec(query).all()], total


def list_classes(
    session: Session, upcoming: bool, offset: int, limit: int, member_id: int | None = None
) -> tuple[list[dict], int]:
    """Ordered by start time. With upcoming, only classes that have not started yet."""
    filters = [_when_filter("upcoming")] if upcoming else []
    return _page(session, filters, col(GymClass.starts_at), offset, limit, member_id)


def list_trainer_classes(
    session: Session, trainer_id: int, when: When, offset: int, limit: int
) -> tuple[list[dict], int]:
    """The classes this trainer teaches: upcoming ones soonest first, or past ones latest first."""
    filters = [col(GymClass.trainer_id) == trainer_id, _when_filter(when)]
    return _page(session, filters, _when_order(when), offset, limit, None)


def update_class(session: Session, class_id: int, changes: dict) -> dict:
    """Only the fields sent change. Capacity cannot go below the current bookings."""
    gym_class = _get(session, class_id)
    booked = _count_bookings(session, class_id)
    if "capacity" in changes and changes["capacity"] < booked:
        raise CapacityBelowBookingsError(f"Capacity cannot be lower than the {booked} booking(s) already made")
    if "trainer_id" in changes:
        if changes["trainer_id"] is not None:
            trainer_service.check_trainer(session, changes["trainer_id"])
        # Choosing a trainer, or none, replaces the old text name.
        changes = {**changes, "trainer_name": None}
    gym_class.sqlmodel_update(changes)
    gym_class.updated_at = utc_now()
    session.add(gym_class)
    session.commit()
    session.refresh(gym_class)
    return _read(gym_class, _trainer_name(session, gym_class), booked)


def delete_class(session: Session, class_id: int) -> None:
    gym_class = _get(session, class_id)
    # Bookings go first: the database cascades too, but SQLite does not enforce that by default.
    session.exec(delete(ClassBooking).where(col(ClassBooking.class_id) == class_id))
    session.delete(gym_class)
    session.commit()


def _get_for_staff(session: Session, class_id: int, viewer: User) -> GymClass:
    """Whoever manages classes may open every class's bookings; a trainer only those of the classes they teach."""
    gym_class = _get(session, class_id)
    # The class itself is public, so another trainer's class is a 403, not a 404.
    if not rbac.has_permission(viewer, Permission.CLASSES_MANAGE) and not rbac.is_owner(viewer, gym_class.trainer_id):
        raise NotYourClassError(class_id)
    return gym_class


def _booking_read(booking: ClassBooking, member_name: str) -> dict:
    return {**booking.model_dump(), "member_name": member_name}


def list_bookings(session: Session, class_id: int, offset: int, limit: int, viewer: User) -> tuple[list[dict], int]:
    """Who booked this class, in the order they booked, and who attended."""
    _get_for_staff(session, class_id, viewer)
    total = _count_bookings(session, class_id)
    query = (
        select(ClassBooking, User.name)
        .join(User, col(ClassBooking.member_id) == col(User.id))
        .where(col(ClassBooking.class_id) == class_id)
        .order_by(col(ClassBooking.booked_at), col(ClassBooking.member_id))
        .offset(offset)
        .limit(limit)
    )
    return [_booking_read(b, name) for b, name in session.exec(query).all()], total


def mark_attendance(
    session: Session, class_id: int, member_id: int, attended: bool | None, viewer: User
) -> dict:
    """Mark whether someone who booked came. Marking again changes the mark; null clears it."""
    gym_class = _get_for_staff(session, class_id, viewer)
    if as_utc(gym_class.starts_at) - ATTENDANCE_OPENS > utc_now():
        raise AttendanceNotOpenError
    booking = session.get(ClassBooking, (class_id, member_id))
    if booking is None:
        raise MemberNotBookedError(member_id)
    booking.attended = attended
    session.add(booking)
    session.commit()
    session.refresh(booking)
    return _booking_read(booking, session.get(User, member_id).name)


def class_stats(session: Session) -> dict:
    total, upcoming = session.exec(
        select(func.count(), func.count().filter(_when_filter("upcoming"))).select_from(GymClass)
    ).one()
    return {"total": total, "upcoming": upcoming}


def book_class(session: Session, class_id: int, member: User) -> dict:
    """A member books a place (SRS FR-29)."""
    # Locking the class row (on PostgreSQL) makes two people booking the last place take turns,
    # so the capacity is never exceeded. SQLite ignores the lock but runs one write at a time.
    gym_class = session.exec(select(GymClass).where(col(GymClass.id) == class_id).with_for_update()).first()
    if gym_class is None:
        raise ClassNotFoundError(class_id)
    checkin_service.check_membership_valid(member)
    if as_utc(gym_class.starts_at) <= utc_now():
        raise ClassStartedError
    if session.get(ClassBooking, (class_id, member.id)) is not None:
        raise AlreadyBookedError
    if _count_bookings(session, class_id) >= gym_class.capacity:
        raise ClassFullError
    booking = ClassBooking(class_id=class_id, member_id=member.id)
    session.add(booking)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise AlreadyBookedError from exc
    session.refresh(booking)
    return _booking_read(booking, member.name)


def list_member_bookings(
    session: Session, member_id: int, when: When, offset: int, limit: int
) -> tuple[list[dict], int]:
    """A member's bookings with their classes: upcoming ones soonest first, or past ones latest first."""
    filters = [col(ClassBooking.member_id) == member_id, _when_filter(when)]
    joined = col(ClassBooking.class_id) == col(GymClass.id)
    total = session.exec(select(func.count()).select_from(ClassBooking).join(GymClass, joined).where(*filters)).one()
    rows = session.exec(
        select(ClassBooking, GymClass, _TRAINER_NAME)
        .join(GymClass, joined)
        .outerjoin(User, _TRAINER_JOIN)
        .where(*filters)
        .order_by(_when_order(when), col(GymClass.id))
        .offset(offset)
        .limit(limit)
    ).all()
    items = [
        {
            "class_id": c.id,
            "class_name": c.name,
            "starts_at": c.starts_at,
            "duration_minutes": c.duration_minutes,
            "trainer_name": trainer,
            "booked_at": b.booked_at,
            "attended": b.attended,
        }
        for b, c, trainer in rows
    ]
    return items, total


def cancel_booking(session: Session, class_id: int, member: User) -> None:
    """Cancel a member's booking: the member themself, or staff at the front desk for them.
    A class that has started is history, so its booking can no longer be cancelled."""
    gym_class = _get(session, class_id)
    if as_utc(gym_class.starts_at) <= utc_now():
        raise ClassStartedError
    booking = session.get(ClassBooking, (class_id, member.id))
    if booking is None:
        raise BookingNotFoundError
    session.delete(booking)
    session.commit()
