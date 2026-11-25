# Member CRUD endpoints under /api/v1/members (TDD 6.1). Routes only handle HTTP; the rules live in
# app/services/member_service.py.
# A member is a user with a membership, so {member_id} is the user's id.
from typing import Annotated, Literal

from fastapi import APIRouter, Depends

from app.database import SessionDep
from app.deps import CurrentUser
from app.models import (
    AccountPage,
    BookedClassPage,
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
from app.params import Limit, Offset, RowId, Search
from app.rbac import Permission, require_permission
from app.request_info import ClientDep
from app.services import checkin_service, class_service, member_service, payment_service
from app.services.member_service import MemberStatus

router = APIRouter(prefix="/api/v1/members", tags=["members"])

# Each route names the permission it needs (app/rbac.py); in practice gym managers and admins (SRS FR-19).
READ_MEMBERS = Depends(require_permission(Permission.MEMBERS_READ))
RECORD_CHECK_INS = Depends(require_permission(Permission.CHECK_INS_RECORD))
MANAGE_PAYMENTS = Depends(require_permission(Permission.PAYMENTS_MANAGE))
# These also need to know who acts: staff accounts are for admins, and deletes are written to the activity log.
Manager = Annotated[User, Depends(require_permission(Permission.MEMBERS_MANAGE))]
Deleter = Annotated[User, Depends(require_permission(Permission.MEMBERS_DELETE))]


@router.post("", status_code=201, response_model=MemberRead)
def create_member(body: MemberCreate, session: SessionDep, manager: Manager) -> dict:
    """Starts a membership on the account with this email (the person signs up first). Without expires_on it runs for
    the plan's days; with payment_method the plan's price is recorded as paid in the same step.
    422 if no account has the email or the plan is not offered; 409 if that account already has a membership; 403 for a
    gym manager if it is a staff account (admins only)."""
    return member_service.read(session, member_service.start_membership(session, body, manager))


@router.get("", response_model=MemberPage, dependencies=[READ_MEMBERS])
def list_members(
    session: SessionDep,
    offset: Offset = 0,
    limit: Limit = 20,
    status: MemberStatus | None = None,
    q: Search = None,
) -> dict:
    """Newest membership first. A frozen member counts as frozen whatever its expiry date.
    q finds members by part of the name, email or phone, in any case."""
    members, total = member_service.list_members(session, status, offset, limit, (q or "").strip() or None)
    return {"items": member_service.read_many(session, members), "total": total, "offset": offset, "limit": limit}


@router.get("/waiting", response_model=AccountPage, dependencies=[READ_MEMBERS])
def list_waiting(
    session: SessionDep,
    offset: Offset = 0,
    limit: Limit = 20,
    q: Search = None,
) -> dict:
    """User accounts with no membership yet, newest sign-up first: the people to start a membership for.
    Declared before /{member_id} so "waiting" is not read as an ID."""
    items, total = member_service.list_waiting(session, offset, limit, (q or "").strip() or None)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.post("/bulk-delete", response_model=MemberBulkDeleteResult)
def bulk_delete_members(body: MemberBulkDelete, session: SessionDep, admin: Deleter, client: ClientDep) -> dict:
    """Admins only (members:delete). Deletes the members' accounts, all in one transaction. An ID that is not a member
    is skipped, so deleted can be lower than the IDs sent. 400 (and nothing deleted) if any of them is a
    gym manager or admin."""
    return {"deleted": member_service.bulk_delete_members(session, body.ids, admin, client)}


@router.get("/{member_id}", response_model=MemberRead, dependencies=[READ_MEMBERS])
def get_member(member_id: RowId, session: SessionDep) -> dict:
    return member_service.read(session, member_service.get_member(session, member_id))


@router.patch("/{member_id}", response_model=MemberRead)
def update_member(member_id: RowId, body: MemberUpdate, session: SessionDep, manager: Manager) -> dict:
    """Only the fields sent change. A later expires_on renews; is_frozen true / false freezes / unfreezes; trainer_id
    sets the personal trainer (an account with the Trainer role, or null for none).
    phone, date_of_birth and the emergency contact follow the same rules as PATCH /users/me/profile. 403 for a gym
    manager if the member is staff (admins only)."""
    member = member_service.update_member(session, member_id, body.model_dump(exclude_unset=True), manager)
    return member_service.read(session, member)


@router.post("/{member_id}/check-ins", status_code=201, response_model=CheckInRead, dependencies=[RECORD_CHECK_INS])
def record_check_in(member_id: RowId, session: SessionDep, user: CurrentUser) -> dict:
    """400 if the membership is frozen or expired; 409 if the member is checked in today and not checked out yet."""
    return checkin_service.record_check_in(session, member_id, user)


@router.get("/{member_id}/check-ins", response_model=CheckInPage, dependencies=[READ_MEMBERS])
def list_member_check_ins(
    member_id: RowId,
    session: SessionDep,
    offset: Offset = 0,
    limit: Limit = 20,
) -> dict:
    """This member's visits, newest first."""
    items, total = checkin_service.list_member_check_ins(session, member_id, offset, limit)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.post("/{member_id}/payments", status_code=201, response_model=PaymentRead, dependencies=[MANAGE_PAYMENTS])
def record_payment(member_id: RowId, body: PaymentCreate, session: SessionDep, user: CurrentUser) -> dict:
    """Records a payment. With renew_plan the membership is extended by that plan's days in the same step."""
    return payment_service.record_payment(session, member_id, body, user)


@router.get("/{member_id}/payments", response_model=PaymentPage, dependencies=[MANAGE_PAYMENTS])
def list_member_payments(
    member_id: RowId,
    session: SessionDep,
    offset: Offset = 0,
    limit: Limit = 20,
) -> dict:
    """This member's payments, newest first."""
    items, total = payment_service.list_member_payments(session, member_id, offset, limit)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.get("/{member_id}/bookings", response_model=BookedClassPage, dependencies=[READ_MEMBERS])
def list_member_bookings(
    member_id: RowId,
    session: SessionDep,
    when: Literal["upcoming", "past"] = "upcoming",
    offset: Offset = 0,
    limit: Limit = 20,
) -> dict:
    """This member's bookings: upcoming ones soonest first (the default), or past ones latest first."""
    member_service.get_member(session, member_id)
    items, total = class_service.list_member_bookings(session, member_id, when, offset, limit)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.delete("/{member_id}/bookings/{class_id}", status_code=204)
def cancel_member_booking(
    member_id: RowId, class_id: RowId, session: SessionDep, manager: Manager, client: ClientDep
) -> None:
    """The front desk cancels a booking for the member. 400 once the class has started; 404 if there is none."""
    class_service.cancel_booking(session, class_id, member_service.get_member(session, member_id), manager, client)


@router.delete("/{member_id}", status_code=204)
def delete_member(member_id: RowId, session: SessionDep, admin: Deleter, client: ClientDep) -> None:
    """Admins only (members:delete). Deletes the member's account with their check-ins and bookings; payments stay on record.
    400 for a gym manager or admin: change their role first."""
    member_service.delete_member(session, member_id, admin, client)
