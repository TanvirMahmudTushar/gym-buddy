# The logged-in user's own account under /api/v1/users (TDD 6.2).
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.database import SessionDep
from app.deps import CurrentUser, require_roles
from app.models import AccountLookup, CheckInPage, Member, MemberRead, PasswordChange, User, UserNameUpdate, UserRead
from app.services import auth_service, checkin_service, member_service, user_service

router = APIRouter(prefix="/api/v1/users", tags=["users"])


@router.get("/me", response_model=UserRead)
def get_me(user: CurrentUser) -> User:
    return user


@router.patch("/me", response_model=UserRead)
def update_me(body: UserNameUpdate, user: CurrentUser, session: SessionDep) -> User:
    """Only the name can be changed here; email and role cannot."""
    return user_service.rename_user(session, user, body.name)


@router.get("/me/membership", response_model=MemberRead)
def get_my_membership(user: CurrentUser, session: SessionDep) -> Member:
    """The member record linked to this account, and only that one. 404 if none is linked."""
    return member_service.get_own_member(session, user)


@router.get("/me/check-ins", response_model=CheckInPage)
def list_my_check_ins(
    user: CurrentUser,
    session: SessionDep,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict:
    """My visits, newest first. 404 if no membership is linked."""
    member = member_service.get_own_member(session, user)
    items, total = checkin_service.list_member_check_ins(session, member.id, offset, limit)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.post("/me/password", status_code=204)
def change_my_password(body: PasswordChange, user: CurrentUser, session: SessionDep) -> Response:
    """400 if the current password is wrong. Logins made before the change stop working."""
    auth_service.change_password(session, user, body.current_password, body.new_password)
    return Response(status_code=204)


@router.get(
    "/lookup",
    response_model=AccountLookup,
    dependencies=[Depends(require_roles("gym_manager", "admin"))],
)
def lookup_account(
    session: SessionDep,
    email: str | None = None,
    id: Annotated[int | None, Query(gt=0, le=2_147_483_647)] = None,
) -> User:
    """Gym managers and admins find an account by exact email or by ID, to link it to a member."""
    if (email is None) == (id is None):
        raise HTTPException(status_code=422, detail="Give either email or id")
    return user_service.find_account(session, email, id)
