# Equipment and its maintenance under /api/v1/equipment (TDD 6.2). Reading the list and reporting a fault need
# equipment:read (trainers, gym managers, admins); everything else needs equipment:manage (gym managers, admins).
# Routes only handle HTTP; the rules live in app/services/equipment_service.py.
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.database import SessionDep
from app.models import (
    EquipmentCreate,
    EquipmentFilter,
    EquipmentPage,
    EquipmentRead,
    EquipmentReport,
    EquipmentUpdate,
    User,
)
from app.params import Limit, Offset, RowId
from app.rbac import Permission, require_permission
from app.request_info import ClientDep
from app.services import equipment_service

router = APIRouter(prefix="/api/v1/equipment", tags=["equipment"])

READ = Depends(require_permission(Permission.EQUIPMENT_READ))
MANAGE = Depends(require_permission(Permission.EQUIPMENT_MANAGE))
# Reporting a fault also needs to know who noticed it.
Reporter = Annotated[User, Depends(require_permission(Permission.EQUIPMENT_READ))]
# A delete too: it is written to the activity log.
Manager = Annotated[User, Depends(require_permission(Permission.EQUIPMENT_MANAGE))]
Filters = Annotated[EquipmentFilter, Query()]


@router.get("", response_model=EquipmentPage, dependencies=[READ])
def list_equipment(
    session: SessionDep,
    filters: Filters,
    offset: Offset = 0,
    limit: Limit = 20,
) -> dict:
    """By name. status, category, needs_attention (broken or being repaired), service_due (overdue or due within 7
    days) and q combine."""
    items, total = equipment_service.list_equipment(session, filters, offset, limit)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.post("", status_code=201, response_model=EquipmentRead, dependencies=[MANAGE])
def create_equipment(body: EquipmentCreate, session: SessionDep) -> dict:
    """New equipment starts as working. With service_every_days, the next service is counted from last_serviced_on,
    or purchased_on, or today."""
    return equipment_service.create_equipment(session, body)


@router.patch("/{equipment_id}", response_model=EquipmentRead, dependencies=[MANAGE])
def update_equipment(equipment_id: RowId, body: EquipmentUpdate, session: SessionDep) -> dict:
    """Only the fields sent change. Setting status to working clears a reported fault."""
    return equipment_service.update_equipment(session, equipment_id, body.model_dump(exclude_unset=True))


@router.post("/{equipment_id}/report", response_model=EquipmentRead)
def report_fault(equipment_id: RowId, body: EquipmentReport, session: SessionDep, reporter: Reporter) -> dict:
    """Marks it out of order, with what is wrong and who reported it."""
    return equipment_service.report_fault(session, equipment_id, body.issue, reporter)


@router.post("/{equipment_id}/service", response_model=EquipmentRead, dependencies=[MANAGE])
def record_service(equipment_id: RowId, session: SessionDep) -> dict:
    """Serviced or repaired today: it is working again and the next service is counted from today."""
    return equipment_service.record_service(session, equipment_id)


@router.delete("/{equipment_id}", status_code=204)
def delete_equipment(equipment_id: RowId, session: SessionDep, manager: Manager, client: ClientDep) -> None:
    """Written to the activity log."""
    equipment_service.delete_equipment(session, equipment_id, manager, client)
