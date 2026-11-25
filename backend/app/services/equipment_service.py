# Equipment and its maintenance: the list, reported faults and services. Trainers can read the list and report a
# fault; gym managers and admins manage it.
from datetime import timedelta

from sqlalchemy.orm import aliased
from sqlmodel import Session, col, func, select

from app.models import (
    SERVICE_DUE_DAYS,
    ActivityEvent,
    Equipment,
    EquipmentCreate,
    EquipmentFilter,
    User,
    gym_today,
    utc_now,
)
from app.request_info import Client
from app.services import activity_service
from app.services.search import contains_any

Reporter = aliased(User)

# Broken, or being repaired.
NEEDS_ATTENTION = col(Equipment.status) != "working"


class EquipmentNotFoundError(Exception):
    """No equipment has the given ID."""


def _service_due():
    """Overdue, or due today or in the next 7 days. No service date never matches."""
    return col(Equipment.next_service_on) <= gym_today() + timedelta(days=SERVICE_DUE_DAYS)


def _read(item: Equipment, reported_by_name: str | None) -> dict:
    return {**item.model_dump(), "reported_by_name": reported_by_name}


def _with_reporter(filters: list):
    # Outer join: most equipment has no reported fault.
    return (
        select(Equipment, Reporter.name)
        .join(Reporter, col(Equipment.reported_by) == col(Reporter.id), isouter=True)
        .where(*filters)
    )


def _get(session: Session, equipment_id: int) -> Equipment:
    item = session.get(Equipment, equipment_id)
    if item is None:
        raise EquipmentNotFoundError(equipment_id)
    return item


def _one(session: Session, equipment_id: int) -> dict:
    return _read(*session.exec(_with_reporter([col(Equipment.id) == equipment_id])).one())


def _set_next_service(item: Equipment) -> None:
    """Counted from the last service, or from the day it was bought, or from today for something with neither."""
    if item.service_every_days is None:
        item.next_service_on = None
        return
    base = item.last_serviced_on or item.purchased_on or gym_today()
    item.next_service_on = base + timedelta(days=item.service_every_days)


def _save(session: Session, item: Equipment) -> dict:
    item.updated_at = utc_now()
    session.add(item)
    session.commit()
    session.refresh(item)
    return _one(session, item.id)


def _conditions(f: EquipmentFilter) -> list:
    conditions = []
    if f.status:
        conditions.append(col(Equipment.status) == f.status)
    if f.category:
        conditions.append(col(Equipment.category) == f.category)
    if f.needs_attention:
        conditions.append(NEEDS_ATTENTION)
    if f.service_due:
        conditions.append(_service_due())
    if f.q:
        conditions.append(contains_any(f.q, Equipment.name))
    return conditions


def list_equipment(session: Session, f: EquipmentFilter, offset: int, limit: int) -> tuple[list[dict], int]:
    """By name. Filtered by service_due, the most overdue first."""
    conditions = _conditions(f)
    total = session.exec(select(func.count()).select_from(Equipment).where(*conditions)).one()
    order = [col(Equipment.next_service_on)] if f.service_due else []
    query = _with_reporter(conditions).order_by(*order, col(Equipment.name), col(Equipment.id))
    return [_read(*row) for row in session.exec(query.offset(offset).limit(limit)).all()], total


def create_equipment(session: Session, data: EquipmentCreate) -> dict:
    item = Equipment(**data.model_dump())
    _set_next_service(item)
    return _save(session, item)


def _clear_fault(item: Equipment) -> None:
    item.issue = None
    item.reported_by = None
    item.reported_at = None


def update_equipment(session: Session, equipment_id: int, changes: dict) -> dict:
    """Only the fields sent change. Setting it back to working clears a reported fault."""
    item = _get(session, equipment_id)
    item.sqlmodel_update(changes)
    if item.status == "working":
        _clear_fault(item)
    if changes.keys() & {"service_every_days", "last_serviced_on", "purchased_on"}:
        _set_next_service(item)
    return _save(session, item)


def report_fault(session: Session, equipment_id: int, issue: str, reporter: User) -> dict:
    """Mark it out of order with what is wrong. A newer report replaces an older one."""
    item = _get(session, equipment_id)
    item.status = "out_of_order"
    item.issue = issue
    item.reported_by = reporter.id
    item.reported_at = utc_now()
    return _save(session, item)


def record_service(session: Session, equipment_id: int) -> dict:
    """Serviced or repaired today: it works again, the fault is cleared and the next service is counted from today."""
    item = _get(session, equipment_id)
    item.status = "working"
    item.last_serviced_on = gym_today()
    _clear_fault(item)
    _set_next_service(item)
    return _save(session, item)


def delete_equipment(session: Session, equipment_id: int, actor: User, client: Client) -> None:
    item = _get(session, equipment_id)
    activity_service.record(session, ActivityEvent.EQUIPMENT_DELETE, client, actor=actor, details=item.name)
    session.delete(item)
    session.commit()


def equipment_stats(session: Session) -> dict:
    total, needs_attention, service_due = session.exec(
        select(
            func.count(), func.count().filter(NEEDS_ATTENTION), func.count().filter(_service_due())
        ).select_from(Equipment)
    ).one()
    return {"total": total, "needs_attention": needs_attention, "service_due": service_due}
