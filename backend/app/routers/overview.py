# The Gym Manager's start page under /api/v1/overview (TDD 6.2). The numbers come from app/services/stats_service.py.
from fastapi import APIRouter, Depends

from app.database import SessionDep
from app.deps import require_roles
from app.models import Overview
from app.services import stats_service

# Gym managers and admins only (401 without a login, 403 for a user).
router = APIRouter(
    prefix="/api/v1/overview",
    tags=["overview"],
    dependencies=[Depends(require_roles("gym_manager", "admin"))],
)


@router.get("", response_model=Overview)
def get_overview(session: SessionDep) -> dict:
    """Check-ins today, memberships expiring soon, accounts waiting for a membership, payments taken today
    (not voided) and the next 5 classes. No revenue history or account numbers: those are on the admin dashboard."""
    return stats_service.staff_overview(session)
