# Who has checked in today, under /api/v1/check-ins (TDD 6.2).
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.database import SessionDep
from app.deps import require_roles
from app.models import CheckInPage
from app.services import checkin_service

# Gym managers and admins only (401 without a login, 403 for a user).
router = APIRouter(
    prefix="/api/v1/check-ins",
    tags=["check-ins"],
    dependencies=[Depends(require_roles("gym_manager", "admin"))],
)


@router.get("/today", response_model=CheckInPage)
def list_today(
    session: SessionDep,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> dict:
    """Everyone checked in since midnight UTC, newest first."""
    items, total = checkin_service.list_today(session, offset, limit)
    return {"items": items, "total": total, "offset": offset, "limit": limit}
