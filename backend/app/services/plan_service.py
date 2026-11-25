# Membership plans: what the gym sells. Everyone logged in can read them; admins add, edit, retire and delete them.
import re

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, func, select

from app.models import ActivityEvent, MembershipPlan, Payment, PlanCreate, User, utc_now
from app.request_info import Client
from app.services import activity_service

# Room in the code column for a number added to keep the code unique.
_SLUG_LENGTH = 30


class PlanNotFoundError(Exception):
    """No plan has this code (in the address)."""


class PlanNotOfferedError(Exception):
    """The plan sent for a membership or a renewal does not exist or is retired."""


class PlanNameTakenError(Exception):
    """Another plan already has this name."""


class PlanInUseError(Exception):
    """Members or payments have this plan, so it can be retired but not deleted."""


def list_plans(session: Session) -> list[MembershipPlan]:
    """Every plan, cheapest first, retired ones included: old members and payments still show their names."""
    return list(session.exec(select(MembershipPlan).order_by(col(MembershipPlan.price), col(MembershipPlan.plan))).all())


def get_plan(session: Session, code: str) -> MembershipPlan:
    plan = session.get(MembershipPlan, code)
    if plan is None:
        raise PlanNotFoundError(code)
    return plan


def get_offered(session: Session, code: str) -> MembershipPlan:
    """The plan someone is choosing now: it must exist and not be retired."""
    plan = session.get(MembershipPlan, code)
    if plan is None or not plan.is_active:
        raise PlanNotOfferedError(code)
    return plan


def _check_name(session: Session, name: str, own_code: str | None = None) -> None:
    same = select(MembershipPlan).where(func.lower(MembershipPlan.name) == name.lower())
    if any(plan.plan != own_code for plan in session.exec(same).all()):
        raise PlanNameTakenError(name)


def _new_code(session: Session, name: str) -> str:
    """"Student monthly" becomes student-monthly; a number is added when that code is already used."""
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:_SLUG_LENGTH].strip("-") or "plan"
    code, number = base, 2
    while session.get(MembershipPlan, code) is not None:
        code, number = f"{base}-{number}", number + 1
    return code


def create_plan(session: Session, data: PlanCreate) -> MembershipPlan:
    _check_name(session, data.name)
    plan = MembershipPlan(plan=_new_code(session, data.name), **data.model_dump())
    session.add(plan)
    try:
        session.commit()
    except IntegrityError as exc:
        # The same plan added twice at the same moment: the primary key lets only one through.
        session.rollback()
        raise PlanNameTakenError(data.name) from exc
    session.refresh(plan)
    return plan


def update_plan(session: Session, code: str, changes: dict) -> MembershipPlan:
    """Only the fields sent change. Payments already recorded and expiry dates already set are not changed."""
    plan = get_plan(session, code)
    if "name" in changes:
        _check_name(session, changes["name"], own_code=code)
    plan.sqlmodel_update(changes)
    plan.updated_at = utc_now()
    session.add(plan)
    session.commit()
    session.refresh(plan)
    return plan


def delete_plan(session: Session, code: str, actor: User, client: Client) -> None:
    """Only a plan nobody ever had. One in use is retired instead, so its members and payments keep its name."""
    plan = get_plan(session, code)
    used = session.exec(select(User.id).where(col(User.plan) == code).limit(1)).first() or session.exec(
        select(Payment.id).where(col(Payment.plan) == code).limit(1)
    ).first()
    if used is not None:
        raise PlanInUseError(code)
    activity_service.record(session, ActivityEvent.PLAN_DELETE, client, actor=actor, details=plan.name)
    session.delete(plan)
    session.commit()
