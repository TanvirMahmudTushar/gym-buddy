# Admin endpoints under /api/v1/admin: stats, revenue, user list, roles, ban / unban, plan prices (TDD 6.2).
# Each route names its permission (app/rbac.py); only the Admin role holds them, so everyone else gets 403.
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response

from app.database import SessionDep
from app.models import (
    AdminStats,
    AdminUserPage,
    AdminUserRead,
    BanRequest,
    PasswordResetResult,
    Plan,
    PlanPrice,
    PlanRead,
    PlanUpdate,
    RevenueStats,
    User,
    UserRoleUpdate,
)
from app.rbac import Permission, require_permission
from app.services import payment_service, revenue_service, stats_service, user_service

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

READ_DASHBOARD = Depends(require_permission(Permission.DASHBOARD_READ))
READ_USERS = Depends(require_permission(Permission.USERS_READ))
BAN_USERS = Depends(require_permission(Permission.USERS_BAN))
EDIT_PLANS = Depends(require_permission(Permission.PLANS_EDIT))
# These routes also need to know who is acting, for the safety rules (not yourself, not another admin).
RoleChanger = Annotated[User, Depends(require_permission(Permission.USERS_CHANGE_ROLE))]
Banner = Annotated[User, Depends(require_permission(Permission.USERS_BAN))]
PasswordResetter = Annotated[User, Depends(require_permission(Permission.USERS_RESET_PASSWORD))]


@router.get("/stats", response_model=AdminStats, dependencies=[READ_DASHBOARD])
def get_stats(session: SessionDep) -> dict:
    return stats_service.admin_stats(session)


@router.get("/revenue", response_model=RevenueStats, dependencies=[READ_DASHBOARD])
def get_revenue(session: SessionDep) -> dict:
    """Money taken today, this month and in the last 30 days (also split by method), and in each of the last 6
    months. UTC calendar days, like the payments list; voided payments are left out."""
    return revenue_service.revenue_stats(session)


@router.get("/users", response_model=AdminUserPage, dependencies=[READ_USERS])
def list_users(
    session: SessionDep,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    q: Annotated[str | None, Query(max_length=100)] = None,
) -> dict:
    """Newest first, each with their membership. q finds users by part of the name or email."""
    items, total = user_service.list_users(session, offset, limit, (q or "").strip() or None)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.patch("/users/{user_id}/role", response_model=AdminUserRead)
def change_role(user_id: int, body: UserRoleUpdate, session: SessionDep, admin: RoleChanger) -> User:
    """An admin cannot change their own role (400), so the system always keeps an admin."""
    return user_service.change_role(session, admin, user_id, body.role)


@router.post("/users/{user_id}/ban", response_model=AdminUserRead)
def ban_user(user_id: int, session: SessionDep, admin: Banner, body: BanRequest | None = None) -> User:
    """The user is locked out at once. An admin cannot ban themself or another admin (400)."""
    return user_service.ban_user(session, admin, user_id, body.reason if body else None)


@router.post("/users/{user_id}/unban", response_model=AdminUserRead, dependencies=[BAN_USERS])
def unban_user(user_id: int, session: SessionDep) -> User:
    return user_service.unban_user(session, user_id)


@router.post("/users/{user_id}/reset-password", response_model=PasswordResetResult)
def reset_password(user_id: int, session: SessionDep, admin: PasswordResetter, response: Response) -> dict:
    """Makes a random temporary password and returns it this once. The account's logins end, and it must choose a
    new password before doing anything else. Not for your own account or another admin's (400)."""
    user, temporary = user_service.reset_password(session, admin, user_id)
    # The temporary password must not be kept by the browser or any cache on the way.
    response.headers["Cache-Control"] = "no-store"
    return {"user": user, "temporary_password": temporary}


@router.put("/plans/{plan}", response_model=PlanRead, dependencies=[EDIT_PLANS])
def update_plan(plan: Plan, body: PlanUpdate, session: SessionDep) -> PlanPrice:
    """Sets the price (whole taka) and the number of days a renewal adds. The three plans cannot be added to or removed."""
    return payment_service.update_plan_price(session, plan, body.price, body.duration_days)
