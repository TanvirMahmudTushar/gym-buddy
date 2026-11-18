# User management for admins under /api/v1/admin (TDD 6.2).
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.database import SessionDep
from app.deps import require_roles
from app.models import User, UserPage, UserRead, UserRoleUpdate
from app.services import user_service

# Every route here is for admins only (403 for everyone else).
router = APIRouter(
    prefix="/api/v1/admin",
    tags=["admin"],
    dependencies=[Depends(require_roles("admin"))],
)


@router.get("/users", response_model=UserPage)
def list_users(
    session: SessionDep,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict:
    items, total = user_service.list_users(session, offset, limit)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.patch("/users/{user_id}/role", response_model=UserRead)
def change_role(
    user_id: int,
    body: UserRoleUpdate,
    session: SessionDep,
    admin: Annotated[User, Depends(require_roles("admin"))],
) -> User:
    """An admin cannot change their own role (400), so the system always keeps an admin."""
    return user_service.change_role(session, admin, user_id, body.role)
