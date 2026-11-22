# Content moderation under /api/v1/admin/workouts and /api/v1/admin/groups (SRS 3.7k, TDD 6.2).
# Every route needs content:moderate (app/rbac.py), which only the Admin role holds; everyone else gets 403.
# Routes only handle HTTP; the queries live in app/services/moderation_service.py.
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response

from app.database import SessionDep
from app.models import (
    ContentBulkDelete,
    ContentDeleted,
    ModerationGroupFilter,
    ModerationGroupPage,
    ModerationWorkoutFilter,
    ModerationWorkoutPage,
    User,
    utc_today,
)
from app.rbac import Permission, require_permission
from app.request_info import ClientDep
from app.services import moderation_service

router = APIRouter(prefix="/api/v1/admin", tags=["moderation"])

READ = Depends(require_permission(Permission.CONTENT_MODERATE))
# Deletes and exports also need to know who acts: both are written to the activity log.
Moderator = Annotated[User, Depends(require_permission(Permission.CONTENT_MODERATE))]
WorkoutFilters = Annotated[ModerationWorkoutFilter, Query()]
GroupFilters = Annotated[ModerationGroupFilter, Query()]
# The id columns are 32-bit integers, so a larger id is refused as invalid instead of reaching the database.
RowId = Annotated[int, Path(ge=1, le=2_147_483_647)]
Offset = Annotated[int, Query(ge=0)]
Limit = Annotated[int, Query(ge=1, le=100)]
CSV_RESPONSE = {200: {"content": {"text/csv": {}}, "description": "The matching rows as CSV"}}


def _csv(content: str, name: str) -> Response:
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        # People's own workouts and names: no cache on the way may keep a copy.
        headers={
            "Content-Disposition": f'attachment; filename="{name}-{utc_today().isoformat()}.csv"',
            "Cache-Control": "no-store",
        },
    )


@router.get("/workouts", response_model=ModerationWorkoutPage, dependencies=[READ])
def list_workouts(session: SessionDep, filters: WorkoutFilters, offset: Offset = 0, limit: Limit = 20) -> dict:
    """Every workout, personal or in a group, latest workout date first. owner_id, group_id, kind (personal or
    group), date_from and date_to (the workout's date) and q (title, notes, owner's name or email) combine."""
    items, total = moderation_service.list_workouts(session, filters, offset, limit)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


# The fixed paths are declared before /workouts/{workout_id}.
@router.get("/workouts/export.csv", response_class=Response, responses=CSV_RESPONSE)
def export_workouts(session: SessionDep, filters: WorkoutFilters, admin: Moderator, client: ClientDep) -> Response:
    """The same rows and order as the list with the same filters. The download is logged."""
    return _csv(moderation_service.export_workouts_csv(session, filters, admin, client), "workouts")


@router.post("/workouts/bulk-delete", response_model=ContentDeleted)
def bulk_delete_workouts(body: ContentBulkDelete, session: SessionDep, admin: Moderator, client: ClientDep) -> dict:
    """Deletes up to 100 workouts in one transaction; ids that match nothing are skipped. Each delete is logged."""
    return {"deleted": moderation_service.delete_workouts(session, admin, body.ids, client)}


@router.delete("/workouts/{workout_id}", status_code=204)
def delete_workout(workout_id: RowId, session: SessionDep, admin: Moderator, client: ClientDep) -> None:
    if not moderation_service.delete_workouts(session, admin, [workout_id], client):
        raise HTTPException(status_code=404, detail="Workout not found")


@router.get("/groups", response_model=ModerationGroupPage, dependencies=[READ])
def list_groups(session: SessionDep, filters: GroupFilters, offset: Offset = 0, limit: Limit = 20) -> dict:
    """Every training group, newest first, with its owner and how many people and workouts it has. owner_id,
    date_from and date_to (the UTC day it was made) and q (group name, owner's name or email) combine."""
    items, total = moderation_service.list_groups(session, filters, offset, limit)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.get("/groups/export.csv", response_class=Response, responses=CSV_RESPONSE)
def export_groups(session: SessionDep, filters: GroupFilters, admin: Moderator, client: ClientDep) -> Response:
    """The same rows and order as the list with the same filters. The download is logged."""
    return _csv(moderation_service.export_groups_csv(session, filters, admin, client), "groups")


@router.post("/groups/bulk-delete", response_model=ContentDeleted)
def bulk_delete_groups(body: ContentBulkDelete, session: SessionDep, admin: Moderator, client: ClientDep) -> dict:
    """Deletes up to 100 groups with their workouts and memberships, in one transaction. Each delete is logged."""
    return {"deleted": moderation_service.delete_groups(session, admin, body.ids, client)}


@router.delete("/groups/{group_id}", status_code=204)
def delete_group(group_id: RowId, session: SessionDep, admin: Moderator, client: ClientDep) -> None:
    """Deletes the group with its workouts and memberships."""
    if not moderation_service.delete_groups(session, admin, [group_id], client):
        raise HTTPException(status_code=404, detail="Group not found")
