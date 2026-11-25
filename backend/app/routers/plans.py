# Membership plans under /api/v1/plans (TDD 6.2). Anyone logged in can read them; changing them needs plans:edit
# (admins). Routes only handle HTTP; the rules live in app/services/plan_service.py.
from typing import Annotated

from fastapi import APIRouter, Depends

from app.database import SessionDep
from app.deps import CurrentUser
from app.models import MembershipPlan, PlanCreate, PlanRead, PlanUpdate, User
from app.rbac import Permission, require_permission
from app.request_info import ClientDep
from app.services import plan_service

router = APIRouter(prefix="/api/v1/plans", tags=["plans"])

EDIT_PLANS = Depends(require_permission(Permission.PLANS_EDIT))
# A delete also needs to know who acts: it is written to the activity log.
PlanEditor = Annotated[User, Depends(require_permission(Permission.PLANS_EDIT))]


@router.get("", response_model=list[PlanRead])
def list_plans(session: SessionDep, _user: CurrentUser) -> list[MembershipPlan]:
    """Every plan, cheapest first. Retired ones (is_active false) are included, because older members and payments
    still show their names, but they cannot be chosen. Not paged: a gym has few."""
    return plan_service.list_plans(session)


@router.post("", status_code=201, response_model=PlanRead, dependencies=[EDIT_PLANS])
def create_plan(body: PlanCreate, session: SessionDep) -> MembershipPlan:
    """The price is in whole taka. 409 if another plan has the name."""
    return plan_service.create_plan(session, body)


@router.patch("/{plan}", response_model=PlanRead, dependencies=[EDIT_PLANS])
def update_plan(plan: str, body: PlanUpdate, session: SessionDep) -> MembershipPlan:
    """Only the fields sent change; is_active false retires the plan. Payments already taken are not changed."""
    return plan_service.update_plan(session, plan, body.model_dump(exclude_unset=True))


@router.delete("/{plan}", status_code=204)
def delete_plan(plan: str, session: SessionDep, editor: PlanEditor, client: ClientDep) -> None:
    """409 if any member or payment has the plan: retire it instead. Written to the activity log."""
    plan_service.delete_plan(session, plan, editor, client)
