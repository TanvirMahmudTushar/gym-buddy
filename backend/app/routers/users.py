# The logged-in user's own account under /api/v1/users (TDD 6.2).
from typing import Annotated, Literal

from fastapi import APIRouter, Query, Response

from app import rbac
from app.database import SessionDep
from app.deps import AuthDep, CurrentUser, LoggedInUser
from app.request_info import ClientDep
from app.models import (
    BookedClassPage,
    CheckInPage,
    MemberRead,
    MeRead,
    PasswordChange,
    PaymentPage,
    ProfileRead,
    ProfileUpdate,
    SessionRead,
    User,
    UserNameUpdate,
)
from app.services import (
    auth_service,
    checkin_service,
    class_service,
    member_service,
    payment_service,
    profile_service,
    session_service,
    user_service,
)

router = APIRouter(prefix="/api/v1/users", tags=["users"])


@router.get("/me", response_model=MeRead)
def get_me(user: LoggedInUser) -> dict:
    """My account and the permissions of my role. Works even while a new password is due (must_change_password),
    so the app knows to ask for one."""
    return rbac.me(user)


@router.patch("/me", response_model=MeRead)
def update_me(body: UserNameUpdate, user: CurrentUser, session: SessionDep) -> dict:
    """Only the name can be changed here; email and role cannot."""
    return rbac.me(user_service.rename_user(session, user, body.name))


@router.get("/me/profile", response_model=ProfileRead)
def get_my_profile(user: CurrentUser) -> User:
    """My phone, date of birth and emergency contact. Only I and gym staff (through the member endpoints) can read
    them; there is no way to ask for anyone else's here."""
    return user


@router.patch("/me/profile", response_model=ProfileRead)
def update_my_profile(body: ProfileUpdate, user: CurrentUser, session: SessionDep) -> User:
    """Only the fields sent change; null or blank text clears one. date_of_birth must be between 1900-01-01 and
    today, and the emergency contact needs both a name and a phone, or neither (422 otherwise)."""
    return profile_service.update_profile(session, user, body.model_dump(exclude_unset=True))


@router.get("/me/membership", response_model=MemberRead)
def get_my_membership(user: CurrentUser, session: SessionDep) -> dict:
    """This account's own membership. 404 until staff start one."""
    return member_service.read(session, member_service.get_own_membership(user))


@router.get("/me/check-ins", response_model=CheckInPage)
def list_my_check_ins(
    user: CurrentUser,
    session: SessionDep,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict:
    """My visits, newest first. 404 if I have no membership."""
    member = member_service.get_own_membership(user)
    items, total = checkin_service.list_member_check_ins(session, member.id, offset, limit)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.get("/me/bookings", response_model=BookedClassPage)
def list_my_bookings(
    user: CurrentUser,
    session: SessionDep,
    when: Literal["upcoming", "past"] = "upcoming",
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict:
    """My own bookings: upcoming ones soonest first (the default), or past ones latest first. Empty if I have none."""
    items, total = class_service.list_member_bookings(session, user.id, when, offset, limit)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.get("/me/payments", response_model=PaymentPage)
def list_my_payments(
    user: CurrentUser,
    session: SessionDep,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict:
    """My own payments, newest first, voided ones included (they show as voided). Empty if I have none."""
    items, total = payment_service.list_own_payments(session, user, offset, limit)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.post("/me/password", status_code=204)
def change_my_password(body: PasswordChange, auth: AuthDep, session: SessionDep, client: ClientDep) -> Response:
    """400 if the current password is wrong or the new one is the same. Every other session is logged out; this
    one stays. Also the way out of must_change_password after an admin reset."""
    auth_service.change_password(session, auth.user, body.current_password, body.new_password, auth.session_id, client)
    return Response(status_code=204)


@router.get("/me/sessions", response_model=list[SessionRead])
def list_my_sessions(user: CurrentUser, auth: AuthDep, session: SessionDep) -> list[dict]:
    """The browsers where I am logged in, most recently used first. `current` marks the one asking."""
    return [
        {**s.model_dump(), "current": s.id == auth.session_id}
        for s in session_service.list_active_sessions(session, user.id)
    ]


@router.delete("/me/sessions/{session_id}", status_code=204)
def revoke_my_session(session_id: int, user: CurrentUser, session: SessionDep, client: ClientDep) -> Response:
    """Logs that browser out: its refresh cookie and its access token stop working at once. Revoking the current
    session is the same as logging out here. 404 for a session that is not mine or no longer active."""
    session_service.revoke_own_session(session, user, session_id, client)
    return Response(status_code=204)
