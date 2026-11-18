# The logged-in user's own account under /api/v1/users (TDD 6.2).
from fastapi import APIRouter

from app.database import SessionDep
from app.deps import CurrentUser
from app.models import User, UserNameUpdate, UserRead
from app.services import user_service

router = APIRouter(prefix="/api/v1/users", tags=["users"])


@router.get("/me", response_model=UserRead)
def get_me(user: CurrentUser) -> User:
    return user


@router.patch("/me", response_model=UserRead)
def update_me(body: UserNameUpdate, user: CurrentUser, session: SessionDep) -> User:
    """Only the name can be changed here; email and role cannot."""
    return user_service.rename_user(session, user, body.name)
