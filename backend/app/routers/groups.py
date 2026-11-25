# Training groups under /api/v1/groups (SRS 3.7j, TDD 6.2). Trainers and staff start groups (groups:create) and own
# the ones they start. What each person may do in a group comes from app/rbac.py (GroupPermission): someone outside the
# group gets 404, a member without the permission 403. Routes only handle HTTP; the rules live in
# app/services/group_service.py.
from typing import Annotated

from fastapi import APIRouter, Depends

from app.database import SessionDep
from app.deps import CurrentUser
from app.models import (
    GroupCreate,
    GroupMemberAdd,
    GroupMemberRead,
    GroupMemberUpdate,
    GroupPage,
    GroupRead,
    User,
    WorkoutPage,
)
from app.params import Limit, Offset, RowId
from app.rbac import Permission, require_permission
from app.request_info import ClientDep
from app.services import group_service, workout_service

router = APIRouter(prefix="/api/v1/groups", tags=["groups"])

GroupCreator = Annotated[User, Depends(require_permission(Permission.GROUPS_CREATE))]


@router.get("", response_model=GroupPage)
def list_my_groups(user: CurrentUser, session: SessionDep, offset: Offset = 0, limit: Limit = 20) -> dict:
    """The groups I own or am a member of, by name, each with my_permissions."""
    items, total = group_service.list_groups(session, user, offset, limit)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.post("", status_code=201, response_model=GroupRead)
def create_group(body: GroupCreate, creator: GroupCreator, session: SessionDep) -> dict:
    """Trainers, gym managers and admins (403 for a member). I become the owner and hold every permission in it."""
    return group_service.create_group(session, creator, body.name)


@router.get("/{group_id}", response_model=GroupRead)
def get_group(group_id: RowId, user: CurrentUser, session: SessionDep) -> dict:
    """404 unless I am in the group."""
    return group_service.get_group(session, user, group_id)


@router.patch("/{group_id}", response_model=GroupRead)
def rename_group(group_id: RowId, body: GroupCreate, user: CurrentUser, session: SessionDep) -> dict:
    """Owner only: 403 for a member, 404 for anyone else."""
    return group_service.rename_group(session, user, group_id, body.name)


@router.delete("/{group_id}", status_code=204)
def delete_group(group_id: RowId, user: CurrentUser, session: SessionDep, client: ClientDep) -> None:
    """Owner only (403 for a member, 404 for anyone else). Its workouts and memberships are deleted too."""
    group_service.delete_group(session, user, group_id, client)


@router.get("/{group_id}/workouts", response_model=WorkoutPage)
def list_group_workouts(
    group_id: RowId, user: CurrentUser, session: SessionDep, offset: Offset = 0, limit: Limit = 20
) -> dict:
    """The group's workouts, latest workout date first, for anyone in the group. Add one with POST /workouts."""
    items, total = workout_service.list_group(session, user, group_id, offset, limit)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.get("/{group_id}/members", response_model=list[GroupMemberRead])
def list_members(group_id: RowId, user: CurrentUser, session: SessionDep) -> list[dict]:
    """The owner first, then the members by name, with their permissions. Emails are shown to the owner only."""
    return group_service.list_members(session, user, group_id)


@router.post("/{group_id}/members", status_code=201, response_model=GroupMemberRead)
def add_member(group_id: RowId, body: GroupMemberAdd, user: CurrentUser, session: SessionDep) -> dict:
    """Owner only. Adds an existing account by its email, with the permissions ticked. 422 if no account has the
    email; 409 if it is already in the group."""
    return group_service.add_member(session, user, group_id, body)


@router.patch("/{group_id}/members/{user_id}", response_model=GroupMemberRead)
def update_member(
    group_id: RowId, user_id: RowId, body: GroupMemberUpdate, user: CurrentUser, session: SessionDep
) -> dict:
    """Owner only. Only the permissions sent change. 400 for the owner's own row; 404 for someone not in the group."""
    return group_service.update_member(session, user, group_id, user_id, body.model_dump(exclude_unset=True))


@router.delete("/{group_id}/members/{user_id}", status_code=204)
def remove_member(group_id: RowId, user_id: RowId, user: CurrentUser, session: SessionDep) -> None:
    """The owner removes a member, or a member leaves with their own id. 403 for a member removing someone else;
    400 for the owner (delete the group instead). Workouts assigned to that person become unassigned."""
    group_service.remove_member(session, user, group_id, user_id)
