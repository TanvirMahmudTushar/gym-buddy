# Membership plans and their prices under /api/v1/plans (TDD 6.2). Anyone logged in can read them.
from fastapi import APIRouter

from app.database import SessionDep
from app.deps import CurrentUser
from app.models import PlanPrice, PlanRead
from app.services import payment_service

router = APIRouter(prefix="/api/v1/plans", tags=["plans"])


@router.get("", response_model=list[PlanRead])
def list_plans(session: SessionDep, _user: CurrentUser) -> list[PlanPrice]:
    """Monthly, quarterly and yearly, with the price and the number of days each one covers."""
    return payment_service.list_plan_prices(session)
