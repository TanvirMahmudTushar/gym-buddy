# Workouts under /api/v1/workouts (SRS 3.7j, TDD 6.2). Any logged-in account logs its own workouts; group workouts
# follow the caller's permissions in that group (app/rbac.py, GroupPermission). Routes only handle HTTP; the rules
# live in app/services/workout_service.py.
from typing import Annotated

from fastapi import APIRouter, Path, Query

from app.database import SessionDep
from app.deps import CurrentUser
from app.models import WorkoutAssign, WorkoutCreate, WorkoutPage, WorkoutRead, WorkoutUpdate
from app.services import workout_service

router = APIRouter(prefix="/api/v1/workouts", tags=["workouts"])

# The id columns are 32-bit integers, so a larger id is refused as invalid instead of reaching the database.
WorkoutId = Annotated[int, Path(ge=1, le=2_147_483_647)]
Offset = Annotated[int, Query(ge=0)]
Limit = Annotated[int, Query(ge=1, le=100)]


@router.get("", response_model=WorkoutPage)
def list_my_workouts(user: CurrentUser, session: SessionDep, offset: Offset = 0, limit: Limit = 20) -> dict:
    """My personal workouts (in no group), latest workout date first. Only ever my own."""
    items, total = workout_service.list_personal(session, user, offset, limit)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.get("/assigned", response_model=WorkoutPage)
def list_assigned_to_me(user: CurrentUser, session: SessionDep, offset: Offset = 0, limit: Limit = 20) -> dict:
    """Group workouts assigned to me, from every group I am in. Declared before /{workout_id}."""
    items, total = workout_service.list_assigned(session, user, offset, limit)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.post("", status_code=201, response_model=WorkoutRead)
def create_workout(body: WorkoutCreate, user: CurrentUser, session: SessionDep) -> dict:
    """Without group_id the workout is personal. With it, 404 if I am not in that group and 403 without the create
    permission there; assigned_to also needs the assign permission and someone in the group (422 otherwise)."""
    return workout_service.create_workout(session, user, body)


@router.get("/{workout_id}", response_model=WorkoutRead)
def get_workout(workout_id: WorkoutId, user: CurrentUser, session: SessionDep) -> dict:
    """404 for another person's personal workout, and for a group workout of a group I am not in."""
    return workout_service.get_workout(session, user, workout_id)


@router.patch("/{workout_id}", response_model=WorkoutRead)
def update_workout(workout_id: WorkoutId, body: WorkoutUpdate, user: CurrentUser, session: SessionDep) -> dict:
    """Only the fields sent change. A group workout needs the update permission (403 without it)."""
    return workout_service.update_workout(session, user, workout_id, body.model_dump(exclude_unset=True))


@router.put("/{workout_id}/assignee", response_model=WorkoutRead)
def assign_workout(workout_id: WorkoutId, body: WorkoutAssign, user: CurrentUser, session: SessionDep) -> dict:
    """Assigns a group workout to someone in its group, or unassigns it with user_id null. Needs the assign
    permission (403); 400 for a personal workout; 422 for someone outside the group."""
    return workout_service.assign_workout(session, user, workout_id, body.user_id)


@router.delete("/{workout_id}", status_code=204)
def delete_workout(workout_id: WorkoutId, user: CurrentUser, session: SessionDep) -> None:
    """A group workout needs the update permission (403 without it)."""
    workout_service.delete_workout(session, user, workout_id)
