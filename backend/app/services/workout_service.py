# Workouts in training groups (final spec 2.2, SRS 3.7j), used by app/routers/workouts.py and the group workout list in
# app/routers/groups.py. A workout follows the caller's permissions in its group (rbac.group_permissions() through
# group_service): outsiders get 404, members without the permission 403. The person a workout is assigned to marks it
# done.
from sqlalchemy.orm import aliased
from sqlmodel import Session, col, func, or_, select

from app import rbac
from app.models import ActivityEvent, TrainingGroup, User, Workout, WorkoutCreate, utc_now
from app.rbac import GroupPermission
from app.request_info import Client
from app.services import activity_service, group_service


class WorkoutNotFoundError(Exception):
    """No workout has this id, or the caller may not see it."""


class NotAssignedToYouError(Exception):
    """Only the person a workout is assigned to can mark it done."""


class AssigneeNotInGroupError(Exception):
    """The account to assign the workout to is not in its group."""


Owner = aliased(User)
Assignee = aliased(User)


def _with_names(filters: list):
    """Workouts matching the filters, latest workout date first, with the owner's, group's and assignee's names."""
    return (
        select(Workout, Owner.name, TrainingGroup.name, Assignee.name)
        # Outer joins: nobody may be assigned, and the owner's account may be gone.
        .join(Owner, col(Workout.owner_id) == col(Owner.id), isouter=True)
        .join(TrainingGroup, col(Workout.group_id) == col(TrainingGroup.id), isouter=True)
        .join(Assignee, col(Workout.assigned_to) == col(Assignee.id), isouter=True)
        .where(*filters)
        .order_by(col(Workout.workout_date).desc(), col(Workout.id).desc())
    )


def _read(workout: Workout, owner_name: str | None, group_name: str | None, assignee_name: str | None) -> dict:
    return {
        "id": workout.id,
        "title": workout.title,
        "workout_date": workout.workout_date,
        "notes": workout.notes,
        "group_id": workout.group_id,
        "group_name": group_name,
        "owner_id": workout.owner_id,
        "owner_name": owner_name,
        "assigned_to": workout.assigned_to,
        "assigned_to_name": assignee_name,
        "completed_at": workout.completed_at,
        "created_at": workout.created_at,
        "updated_at": workout.updated_at,
    }


def _one(session: Session, workout_id: int) -> dict:
    return _read(*session.exec(_with_names([col(Workout.id) == workout_id])).one())


def _page(session: Session, filters: list, offset: int, limit: int) -> tuple[list[dict], int]:
    total = session.exec(select(func.count()).select_from(Workout).where(*filters)).one()
    rows = session.exec(_with_names(filters).offset(offset).limit(limit)).all()
    return [_read(*row) for row in rows], total


def list_assigned(session: Session, user: User, offset: int, limit: int) -> tuple[list[dict], int]:
    """Group workouts assigned to me, from every group I am in (leaving a group unassigns its workouts from me)."""
    return _page(session, [col(Workout.assigned_to) == user.id, col(Workout.group_id).is_not(None)], offset, limit)


def list_group(session: Session, user: User, group_id: int, offset: int, limit: int) -> tuple[list[dict], int]:
    """A group's workouts, for anyone in the group."""
    group_service.access(session, user, group_id)
    return _page(session, [col(Workout.group_id) == group_id], offset, limit)


def list_of_account(session: Session, user_id: int, limit: int) -> list[dict]:
    """The newest workouts an account added or was assigned, for the admin's user details."""
    items, _ = _page(
        session, [or_(col(Workout.owner_id) == user_id, col(Workout.assigned_to) == user_id)], 0, limit
    )
    return items


def _check_assignee(session: Session, group: TrainingGroup, user_id: int) -> None:
    if not group_service.in_group(session, group, user_id):
        raise AssigneeNotInGroupError(user_id)


def create_workout(session: Session, user: User, data: WorkoutCreate) -> dict:
    """In a group the caller may add to (and assign in, when assigned_to is sent)."""
    group, permissions = group_service.access(session, user, data.group_id)
    group_service.require(permissions, GroupPermission.CREATE)
    if data.assigned_to is not None:
        group_service.require(permissions, GroupPermission.ASSIGN)
        _check_assignee(session, group, data.assigned_to)
    workout = Workout(owner_id=user.id, **data.model_dump())
    session.add(workout)
    session.commit()
    session.refresh(workout)
    return _one(session, workout.id)


def _access(session: Session, user: User, workout_id: int, permission: GroupPermission) -> Workout:
    """The workout if the caller may do this to it: 404 for someone outside its group, 403 for a member without the
    permission."""
    workout = session.get(Workout, workout_id)
    if workout is None or workout.group_id is None:
        raise WorkoutNotFoundError(workout_id)
    try:
        _, permissions = group_service.access(session, user, workout.group_id)
    except group_service.GroupNotFoundError:
        raise WorkoutNotFoundError(workout_id) from None
    group_service.require(permissions, permission)
    return workout


def get_workout(session: Session, user: User, workout_id: int) -> dict:
    _access(session, user, workout_id, GroupPermission.READ)
    return _one(session, workout_id)


def update_workout(session: Session, user: User, workout_id: int, changes: dict) -> dict:
    """Only the fields sent change. Needs the update permission."""
    workout = _access(session, user, workout_id, GroupPermission.UPDATE)
    workout.sqlmodel_update(changes)
    workout.updated_at = utc_now()
    session.add(workout)
    session.commit()
    return _one(session, workout_id)


def assign_workout(session: Session, user: User, workout_id: int, assignee_id: int | None) -> dict:
    """Assign a workout to someone in its group (or unassign it with None). Needs the assign permission."""
    workout = _access(session, user, workout_id, GroupPermission.ASSIGN)
    if assignee_id is not None:
        _check_assignee(session, session.get(TrainingGroup, workout.group_id), assignee_id)
    if workout.assigned_to != assignee_id:
        # The new person has not done it yet.
        workout.completed_at = None
    workout.assigned_to = assignee_id
    workout.updated_at = utc_now()
    session.add(workout)
    session.commit()
    return _one(session, workout_id)


def complete_workout(session: Session, user: User, workout_id: int, done: bool) -> dict:
    """The person it is assigned to marks it done, or clears the mark. Nobody else can, whatever their permissions."""
    workout = _access(session, user, workout_id, GroupPermission.READ)
    if not rbac.is_owner(user, workout.assigned_to):
        raise NotAssignedToYouError(workout_id)
    if done != (workout.completed_at is not None):
        workout.completed_at = utc_now() if done else None
        session.add(workout)
        session.commit()
    return _one(session, workout_id)


def delete_workout(session: Session, user: User, workout_id: int, client: Client) -> None:
    """Only the group's owner, whoever added the workout (an admin can also, through moderation)."""
    workout = _access(session, user, workout_id, GroupPermission.MANAGE)
    group = session.get(TrainingGroup, workout.group_id)
    activity_service.record(
        session,
        ActivityEvent.WORKOUT_DELETE,
        client,
        actor=user,
        details=f"{workout.title} ({workout.workout_date.isoformat()}, in group {group.name})",
    )
    session.delete(workout)
    session.commit()


def counts_for(session: Session, user_id: int) -> dict:
    """How many workouts an account added and was assigned, for the admin's user details."""
    assigned = col(Workout.assigned_to) == user_id
    added, given, completed = session.exec(
        select(
            func.count().filter(col(Workout.owner_id) == user_id),
            func.count().filter(assigned),
            func.count().filter(assigned, col(Workout.completed_at).is_not(None)),
        ).select_from(Workout)
    ).one()
    return {"workouts_added": added, "workouts_assigned": given, "workouts_completed": completed}


def workout_stats(session: Session, since) -> dict:
    """Every workout, the ones added since `since` and the ones marked done, for the admin dashboard."""
    total, recent, completed = session.exec(
        select(
            func.count(),
            func.count().filter(col(Workout.created_at) >= since),
            func.count().filter(col(Workout.completed_at).is_not(None)),
        ).select_from(Workout)
    ).one()
    return {"total": total, "last_7_days": recent, "completed": completed}
