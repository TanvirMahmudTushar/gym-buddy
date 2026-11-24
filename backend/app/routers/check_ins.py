# Attendance under /api/v1/check-ins (TDD 6.2): who came on a day, who is inside now, and checking out.
# Checking in is POST /api/v1/members/{member_id}/check-ins.
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query

from app.database import SessionDep
from app.models import CheckInPage, CheckInRead, utc_today
from app.rbac import Permission, require_permission
from app.services import checkin_service

# The front desk's attendance screen: needs check_ins:record (gym managers and admins; 401 without a login, 403 else).
router = APIRouter(
    prefix="/api/v1/check-ins",
    tags=["check-ins"],
    dependencies=[Depends(require_permission(Permission.CHECK_INS_RECORD))],
)


@router.get("", response_model=CheckInPage)
def list_check_ins(
    session: SessionDep,
    day: date | None = None,
    inside: bool = False,
    q: Annotated[str | None, Query(max_length=100)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> dict:
    """Everyone checked in on a UTC day (today when left out), newest first. inside=true keeps only who has not been
    checked out yet today; q matches part of the member's name, email or phone."""
    items, total = checkin_service.list_day(session, day or utc_today(), inside, (q or "").strip() or None, offset, limit)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.post("/{check_in_id}/check-out", response_model=CheckInRead)
def check_out(check_in_id: Annotated[int, Path(ge=1, le=2_147_483_647)], session: SessionDep) -> dict:
    """Records that the member left, now. 400 if this visit is already checked out or is from an earlier day."""
    return checkin_service.check_out(session, check_in_id)
