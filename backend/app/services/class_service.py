# Classes and their bookings: what a gym manager runs (SRS FR-25 to FR-28).
from sqlmodel import Session, col, delete, func, select

from app.models import ClassBooking, ClassCreate, GymClass, Member, User, utc_now


class ClassNotFoundError(Exception):
    """No class has the given ID."""


class CapacityBelowBookingsError(Exception):
    """The new capacity is lower than the number of members who already booked."""


def _booked_count():
    """A subquery giving each class's number of bookings."""
    return (
        select(func.count())
        .select_from(ClassBooking)
        .where(col(ClassBooking.class_id) == col(GymClass.id))
        .correlate(GymClass)
        .scalar_subquery()
    )


def _read(gym_class: GymClass, booked_count: int) -> dict:
    return {**gym_class.model_dump(exclude={"created_by"}), "booked_count": booked_count}


def _get(session: Session, class_id: int) -> GymClass:
    gym_class = session.get(GymClass, class_id)
    if gym_class is None:
        raise ClassNotFoundError(class_id)
    return gym_class


def _count_bookings(session: Session, class_id: int) -> int:
    return session.exec(select(func.count()).select_from(ClassBooking).where(col(ClassBooking.class_id) == class_id)).one()


def create_class(session: Session, data: ClassCreate, created_by: User) -> dict:
    gym_class = GymClass(**data.model_dump(), created_by=created_by.id)
    session.add(gym_class)
    session.commit()
    session.refresh(gym_class)
    return _read(gym_class, 0)


def get_class(session: Session, class_id: int) -> dict:
    gym_class = _get(session, class_id)
    return _read(gym_class, _count_bookings(session, class_id))


def list_classes(session: Session, upcoming: bool, offset: int, limit: int) -> tuple[list[dict], int]:
    """Ordered by start time. With upcoming, only classes that have not started yet."""
    filters = [col(GymClass.starts_at) >= utc_now()] if upcoming else []
    total = session.exec(select(func.count()).select_from(GymClass).where(*filters)).one()
    query = (
        select(GymClass, _booked_count())
        .where(*filters)
        .order_by(col(GymClass.starts_at), col(GymClass.id))
        .offset(offset)
        .limit(limit)
    )
    return [_read(c, booked) for c, booked in session.exec(query).all()], total


def update_class(session: Session, class_id: int, changes: dict) -> dict:
    """Only the fields sent change. Capacity cannot go below the current bookings."""
    gym_class = _get(session, class_id)
    booked = _count_bookings(session, class_id)
    if "capacity" in changes and changes["capacity"] < booked:
        raise CapacityBelowBookingsError(f"Capacity cannot be lower than the {booked} booking(s) already made")
    gym_class.sqlmodel_update(changes)
    gym_class.updated_at = utc_now()
    session.add(gym_class)
    session.commit()
    session.refresh(gym_class)
    return _read(gym_class, booked)


def delete_class(session: Session, class_id: int) -> None:
    gym_class = _get(session, class_id)
    # Bookings go first: the database cascades too, but SQLite does not enforce that by default.
    session.exec(delete(ClassBooking).where(col(ClassBooking.class_id) == class_id))
    session.delete(gym_class)
    session.commit()


def list_bookings(session: Session, class_id: int, offset: int, limit: int) -> tuple[list[dict], int]:
    """Who booked this class: member name and booking time, in the order they booked."""
    _get(session, class_id)
    total = _count_bookings(session, class_id)
    query = (
        select(ClassBooking, Member.full_name)
        .join(Member, col(ClassBooking.member_id) == col(Member.id))
        .where(col(ClassBooking.class_id) == class_id)
        .order_by(col(ClassBooking.booked_at), col(ClassBooking.member_id))
        .offset(offset)
        .limit(limit)
    )
    items = [
        {"class_id": b.class_id, "member_id": b.member_id, "member_name": name, "booked_at": b.booked_at}
        for b, name in session.exec(query).all()
    ]
    return items, total


def class_stats(session: Session) -> dict:
    total = session.exec(select(func.count()).select_from(GymClass)).one()
    upcoming = session.exec(select(func.count()).select_from(GymClass).where(col(GymClass.starts_at) >= utc_now())).one()
    return {"total": total, "upcoming": upcoming}
