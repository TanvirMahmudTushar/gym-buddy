# Admin-only endpoints under /api/v1/admin: stats, user list, roles, ban / unban, plan prices (TDD 6.2).
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.database import SessionDep
from app.deps import require_roles
from app.models import (
    AdminStats,
    AdminUserPage,
    AdminUserRead,
    BanRequest,
    Plan,
    PlanPrice,
    PlanRead,
    PlanUpdate,
    User,
    UserRoleUpdate,
)
from app.services import payment_service, stats_service, user_service

# Every route here is for admins only (403 for everyone else).
router = APIRouter(
    prefix="/api/v1/admin",
    tags=["admin"],
    dependencies=[Depends(require_roles("admin"))],
)

AdminUser = Annotated[User, Depends(require_roles("admin"))]


@router.get("/stats", response_model=AdminStats)
def get_stats(session: SessionDep) -> dict:
    return stats_service.admin_stats(session)


@router.get("/users", response_model=AdminUserPage)
def list_users(
    session: SessionDep,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict:
    items, total = user_service.list_users(session, offset, limit)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.patch("/users/{user_id}/role", response_model=AdminUserRead)
def change_role(user_id: int, body: UserRoleUpdate, session: SessionDep, admin: AdminUser) -> User:
    """An admin cannot change their own role (400), so the system always keeps an admin."""
    return user_service.change_role(session, admin, user_id, body.role)


@router.post("/users/{user_id}/ban", response_model=AdminUserRead)
def ban_user(user_id: int, session: SessionDep, admin: AdminUser, body: BanRequest | None = None) -> User:
    """The user is locked out at once. An admin cannot ban themself or another admin (400)."""
    return user_service.ban_user(session, admin, user_id, body.reason if body else None)


@router.post("/users/{user_id}/unban", response_model=AdminUserRead)
def unban_user(user_id: int, session: SessionDep) -> User:
    return user_service.unban_user(session, user_id)


@router.put("/plans/{plan}", response_model=PlanRead)
def update_plan(plan: Plan, body: PlanUpdate, session: SessionDep) -> PlanPrice:
    """Sets the price (whole taka) and the number of days a renewal adds. The three plans cannot be added to or removed."""
    return payment_service.update_plan_price(session, plan, body.price, body.duration_days)
