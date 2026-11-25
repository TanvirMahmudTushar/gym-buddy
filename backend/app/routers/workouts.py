# Workouts in training groups under /api/v1/workouts (SRS 3.7j, TDD 6.2). Every route follows the caller's permissions
# in the workout's group (app/rbac.py, GroupPermission). Routes only handle HTTP; the rules live in
# app/services/workout_service.py. A group's workouts are listed at GET /api/v1/groups/{group_id}/workouts.
from fastapi import APIRouter

from app.database import SessionDep
from app.deps import CurrentUser
from app.models import WorkoutAssign, WorkoutCompletion, WorkoutCreate, WorkoutPage, WorkoutRead, WorkoutUpdate
from app.params import Limit, Offset, RowId
from app.request_info import ClientDep
from app.services import workout_service

router = APIRouter(prefix="/api/v1/workouts", tags=["workouts"])



@router.get("/assigned", response_model=WorkoutPage)
def list_assigned_to_me(user: CurrentUser, session: SessionDep, offset: Offset = 0, limit: Limit = 20) -> dict:
    """The workouts assigned to me, from every group I am in. Declared before /{workout_id}."""
    items, total = workout_service.list_assigned(session, user, offset, limit)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.post("", status_code=201, response_model=WorkoutRead)
def create_workout(body: WorkoutCreate, user: CurrentUser, session: SessionDep) -> dict:
    """404 if I am not in that group and 403 without the create permission there; assigned_to also needs the assign
    permission and someone in the group (422 otherwise)."""
    return workout_service.create_workout(session, user, body)


@router.get("/{workout_id}", response_model=WorkoutRead)
def get_workout(workout_id: RowId, user: CurrentUser, session: SessionDep) -> dict:
    """404 for a workout of a group I am not in."""
    return workout_service.get_workout(session, user, workout_id)


@router.patch("/{workout_id}", response_model=WorkoutRead)
def update_workout(workout_id: RowId, body: WorkoutUpdate, user: CurrentUser, session: SessionDep) -> dict:
    """Only the fields sent change. Needs the update permission in its group (403 without it)."""
    return workout_service.update_workout(session, user, workout_id, body.model_dump(exclude_unset=True))


@router.put("/{workout_id}/assignee", response_model=WorkoutRead)
def assign_workout(workout_id: RowId, body: WorkoutAssign, user: CurrentUser, session: SessionDep) -> dict:
    """Assigns a workout to someone in its group, or unassigns it with user_id null. Needs the assign permission
    (403); 422 for someone outside the group."""
    return workout_service.assign_workout(session, user, workout_id, body.user_id)


@router.put("/{workout_id}/completion", response_model=WorkoutRead)
def complete_workout(workout_id: RowId, body: WorkoutCompletion, user: CurrentUser, session: SessionDep) -> dict:
    """The person it is assigned to marks it done, or clears the mark (403 for anyone else in the group)."""
    return workout_service.complete_workout(session, user, workout_id, body.done)


@router.delete("/{workout_id}", status_code=204)
def delete_workout(workout_id: RowId, user: CurrentUser, session: SessionDep, client: ClientDep) -> None:
    """Only the owner of its group (403 for a member, whatever their permissions)."""
    workout_service.delete_workout(session, user, workout_id, client)
