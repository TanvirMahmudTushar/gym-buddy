# Admin endpoints under /api/v1/admin: stats, revenue, users (list, details, CSV, roles, ban / unban one or many,
# password reset, ending their sessions) (TDD 6.2).
# Each route names its permission (app/rbac.py); only the Admin role holds them, so everyone else gets 403.
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response

from app.database import SessionDep
from app.models import (
    AdminStats,
    AdminUserDetail,
    AdminUserPage,
    AdminUserRead,
    BanRequest,
    BulkBanResult,
    BulkUnbanResult,
    BulkUserAction,
    PasswordResetResult,
    RevenueStats,
    SessionsRevoked,
    User,
    UserFilter,
    UserRoleUpdate,
    gym_today,
)
from app.params import Limit, Offset, RowId
from app.rbac import Permission, require_permission
from app.request_info import ClientDep
from app.services import revenue_service, stats_service, user_service

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

READ_DASHBOARD = Depends(require_permission(Permission.DASHBOARD_READ))
READ_USERS = Depends(require_permission(Permission.USERS_READ))
# These routes also need to know who is acting, for the safety rules (not yourself, not another admin) and for
# the activity log, which records who made each change and from where (ClientDep).
RoleChanger = Annotated[User, Depends(require_permission(Permission.USERS_CHANGE_ROLE))]
Banner = Annotated[User, Depends(require_permission(Permission.USERS_BAN))]
PasswordResetter = Annotated[User, Depends(require_permission(Permission.USERS_RESET_PASSWORD))]
SessionRevoker = Annotated[User, Depends(require_permission(Permission.USERS_REVOKE_SESSIONS))]
Exporter = Annotated[User, Depends(require_permission(Permission.USERS_EXPORT))]
UserFilters = Annotated[UserFilter, Query()]


@router.get("/stats", response_model=AdminStats, dependencies=[READ_DASHBOARD])
def get_stats(session: SessionDep) -> dict:
    return stats_service.admin_stats(session)


@router.get("/revenue", response_model=RevenueStats, dependencies=[READ_DASHBOARD])
def get_revenue(session: SessionDep) -> dict:
    """Money taken today, this month and in the last 30 days (also split by method), and revenue, expenses and net
    income in each of the last 6 months. Days at the gym, like the payments list; voided payments are left out."""
    return revenue_service.revenue_stats(session)


@router.get("/users", response_model=AdminUserPage, dependencies=[READ_USERS])
def list_users(
    session: SessionDep,
    filters: UserFilters,
    offset: Offset = 0,
    limit: Limit = 20,
) -> dict:
    """Newest first, each with their membership. q (part of the name or email), role and status (active or banned)
    combine with each other and with paging."""
    items, total = user_service.list_users(session, filters, offset, limit)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


# The fixed paths below are declared before /users/{user_id}, so "export.csv" is never read as an id.
@router.get(
    "/users/export.csv",
    response_class=Response,
    responses={200: {"content": {"text/csv": {}}, "description": "The matching users as CSV"}},
)
def export_users(session: SessionDep, filters: UserFilters, admin: Exporter, client: ClientDep) -> Response:
    """Needs users:export. The same filters and order as the list, up to 10,000 users. The download is logged."""
    filename = f"users-{gym_today().isoformat()}.csv"
    return Response(
        content=user_service.export_csv(session, filters, admin, client),
        media_type="text/csv; charset=utf-8",
        # Names and emails: no cache on the way may keep a copy.
        headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"},
    )


@router.post("/users/bulk-ban", response_model=BulkBanResult)
def bulk_ban(body: BulkUserAction, session: SessionDep, admin: Banner, client: ClientDep) -> dict:
    """Bans up to 100 accounts in one transaction, each with the reason, and ends their sessions. Yourself, admins,
    accounts already banned and unknown ids are skipped and listed with why; the rest are still banned."""
    return user_service.bulk_ban(session, admin, body.ids, body.reason, client)


@router.post("/users/bulk-unban", response_model=BulkUnbanResult)
def bulk_unban(body: BulkUserAction, session: SessionDep, admin: Banner, client: ClientDep) -> dict:
    """Unbans up to 100 accounts in one transaction. Accounts that are not banned and unknown ids are skipped and
    listed. The reason is written to the activity log."""
    return user_service.bulk_unban(session, admin, body.ids, body.reason, client)


@router.get("/users/{user_id}", response_model=AdminUserDetail, dependencies=[READ_USERS])
def get_user_detail(user_id: RowId, session: SessionDep) -> dict:
    """The account and membership, its active sessions, how many visits, bookings, payments and workouts it has, its
    groups and its 10 newest activity rows."""
    return user_service.user_detail(session, user_id)


@router.post("/users/{user_id}/revoke-sessions", response_model=SessionsRevoked)
def revoke_sessions(user_id: RowId, session: SessionDep, admin: SessionRevoker, client: ClientDep) -> dict:
    """Ends every active session of the account: its next request gets 401, so the app shows Log in. Not for your
    own account (400; use My account)."""
    return {"revoked": user_service.revoke_sessions(session, admin, user_id, client)}


@router.patch("/users/{user_id}/role", response_model=AdminUserRead)
def change_role(user_id: RowId, body: UserRoleUpdate, session: SessionDep, admin: RoleChanger, client: ClientDep) -> User:
    """An admin cannot change their own role (400), so the system always keeps an admin."""
    return user_service.change_role(session, admin, user_id, body.role, client)


@router.post("/users/{user_id}/ban", response_model=AdminUserRead)
def ban_user(
    user_id: RowId, session: SessionDep, admin: Banner, client: ClientDep, body: BanRequest | None = None
) -> User:
    """The user is locked out at once. An admin cannot ban themself or another admin (400)."""
    return user_service.ban_user(session, admin, user_id, body.reason if body else None, client)


@router.post("/users/{user_id}/unban", response_model=AdminUserRead)
def unban_user(user_id: RowId, session: SessionDep, admin: Banner, client: ClientDep) -> User:
    return user_service.unban_user(session, admin, user_id, client)


@router.post("/users/{user_id}/reset-password", response_model=PasswordResetResult)
def reset_password(
    user_id: RowId, session: SessionDep, admin: PasswordResetter, response: Response, client: ClientDep
) -> dict:
    """Makes a random temporary password and returns it this once. The account's logins end, and it must choose a
    new password before doing anything else. Not for your own account or another admin's (400)."""
    user, temporary = user_service.reset_password(session, admin, user_id, client)
    # The temporary password must not be kept by the browser or any cache on the way.
    response.headers["Cache-Control"] = "no-store"
    return {"user": user, "temporary_password": temporary}
