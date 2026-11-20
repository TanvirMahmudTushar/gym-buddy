# Member CRUD endpoints under /api/v1/members (TDD 6.1). Routes only handle HTTP; the rules live in app/services/member_service.py.
# A member is a user with a membership, so {member_id} is the user's id.
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.database import SessionDep
from app.deps import CurrentUser, require_roles
from app.models import (
    AccountPage,
    CheckInPage,
    CheckInRead,
    MemberBulkDelete,
    MemberBulkDeleteResult,
    MemberCreate,
    MemberPage,
    MemberRead,
    MemberUpdate,
    PaymentCreate,
    PaymentPage,
    PaymentRead,
    User,
)
from app.services import checkin_service, member_service, payment_service
from app.services.member_service import MemberStatus

# Part of a name, email or phone typed in a search box; surrounding spaces are ignored.
Search = Annotated[str | None, Query(max_length=100)]

# Only gym managers and admins may touch member records (SRS FR-19).
router = APIRouter(
    prefix="/api/v1/members",
    tags=["members"],
    dependencies=[Depends(require_roles("gym_manager", "admin"))],
)


@router.post("", status_code=201, response_model=MemberRead)
def create_member(body: MemberCreate, session: SessionDep) -> User:
    """Starts a membership on the account with this email (the person signs up first).
    422 if no account has the email; 409 if that account already has a membership."""
    return member_service.start_membership(session, body)


@router.get("", response_model=MemberPage)
def list_members(
    session: SessionDep,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    status: MemberStatus | None = None,
    q: Search = None,
) -> dict:
    """Newest membership first. A frozen member counts as frozen whatever its expiry date.
    q finds members by part of the name, email or phone, in any case."""
    items, total = member_service.list_members(session, status, offset, limit, (q or "").strip() or None)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.get("/waiting", response_model=AccountPage)
def list_waiting(
    session: SessionDep,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    q: Search = None,
) -> dict:
    """User accounts with no membership yet, newest sign-up first: the people to start a membership for.
    Declared before /{member_id} so "waiting" is not read as an ID."""
    items, total = member_service.list_waiting(session, offset, limit, (q or "").strip() or None)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.post("/bulk-delete", response_model=MemberBulkDeleteResult)
def bulk_delete_members(body: MemberBulkDelete, session: SessionDep) -> dict:
    """Deletes the members' accounts, all in one transaction. An ID that is not a member is skipped, so deleted can
    be lower than the IDs sent. 400 (and nothing deleted) if any of them is a gym manager or admin."""
    return {"deleted": member_service.bulk_delete_members(session, body.ids)}


@router.get("/{member_id}", response_model=MemberRead)
def get_member(member_id: int, session: SessionDep) -> User:
    return member_service.get_member(session, member_id)


@router.patch("/{member_id}", response_model=MemberRead)
def update_member(member_id: int, body: MemberUpdate, session: SessionDep) -> User:
    """Only the fields sent change. A later expires_on renews; is_frozen true / false freezes / unfreezes."""
    return member_service.update_member(session, member_id, body.model_dump(exclude_unset=True))


@router.post("/{member_id}/check-ins", status_code=201, response_model=CheckInRead)
def record_check_in(member_id: int, session: SessionDep, user: CurrentUser) -> dict:
    """400 if the membership is frozen or expired. Several check-ins on the same day are allowed."""
    return checkin_service.record_check_in(session, member_id, user)


@router.get("/{member_id}/check-ins", response_model=CheckInPage)
def list_member_check_ins(
    member_id: int,
    session: SessionDep,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict:
    """This member's visits, newest first."""
    items, total = checkin_service.list_member_check_ins(session, member_id, offset, limit)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.post("/{member_id}/payments", status_code=201, response_model=PaymentRead)
def record_payment(member_id: int, body: PaymentCreate, session: SessionDep, user: CurrentUser) -> dict:
    """Records a payment. With renew_plan the membership is extended by that plan's days in the same step."""
    return payment_service.record_payment(session, member_id, body, user)


@router.get("/{member_id}/payments", response_model=PaymentPage)
def list_member_payments(
    member_id: int,
    session: SessionDep,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict:
    """This member's payments, newest first."""
    items, total = payment_service.list_member_payments(session, member_id, offset, limit)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.delete("/{member_id}", status_code=204)
def delete_member(member_id: int, session: SessionDep) -> None:
    """Deletes the member's account with their check-ins and bookings; payments stay on record.
    400 for a gym manager or admin: change their role first."""
    member_service.delete_member(session, member_id)
