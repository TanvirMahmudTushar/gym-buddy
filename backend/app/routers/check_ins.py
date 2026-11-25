# Attendance under /api/v1/check-ins (TDD 6.2): who came on a day, who is inside now, and checking out.
# Checking in is POST /api/v1/members/{member_id}/check-ins.


from fastapi import APIRouter, Depends

from app.database import SessionDep
from app.models import CheckInPage, CheckInRead, Day, gym_today
from app.params import Limit, Offset, RowId, Search
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
    day: Day | None = None,
    inside: bool = False,
    q: Search = None,
    offset: Offset = 0,
    limit: Limit = 50,
) -> dict:
    """Everyone checked in on a day (today when left out), newest first. inside=true keeps only who has not been
    checked out yet today; q matches part of the member's name, email or phone."""
    items, total = checkin_service.list_day(session, day or gym_today(), inside, (q or "").strip() or None, offset, limit)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.post("/{check_in_id}/check-out", response_model=CheckInRead)
def check_out(check_in_id: RowId, session: SessionDep) -> dict:
    """Records that the member left, now. 400 if this visit is already checked out or is from an earlier day."""
    return checkin_service.check_out(session, check_in_id)
