# The logged-in user's own account under /api/v1/users (TDD 6.2).
from typing import Annotated, Literal

from fastapi import APIRouter, Query, Response

from app.database import SessionDep
from app.deps import CurrentUser
from app.models import (
    BookedClassPage,
    CheckInPage,
    MemberRead,
    PasswordChange,
    PaymentPage,
    User,
    UserNameUpdate,
    UserRead,
)
from app.services import auth_service, checkin_service, class_service, member_service, payment_service, user_service

router = APIRouter(prefix="/api/v1/users", tags=["users"])


@router.get("/me", response_model=UserRead)
def get_me(user: CurrentUser) -> User:
    return user


@router.patch("/me", response_model=UserRead)
def update_me(body: UserNameUpdate, user: CurrentUser, session: SessionDep) -> User:
    """Only the name can be changed here; email and role cannot."""
    return user_service.rename_user(session, user, body.name)


@router.get("/me/membership", response_model=MemberRead)
def get_my_membership(user: CurrentUser) -> User:
    """This account's own membership. 404 until staff start one."""
    return member_service.get_own_membership(user)


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
def change_my_password(body: PasswordChange, user: CurrentUser, session: SessionDep) -> Response:
    """400 if the current password is wrong. Logins made before the change stop working."""
    auth_service.change_password(session, user, body.current_password, body.new_password)
    return Response(status_code=204)
