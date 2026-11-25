# Content moderation (final spec 2.3, SRS 3.7k): admins find, export and delete any training group and any workout,
# in groups they are not in too (it needs content:moderate).
# Admins cannot edit someone else's content here, and a delete is final (no soft delete). Every delete is written to
# the activity log, naming the owner as the account affected.
from datetime import timedelta

from sqlalchemy import or_
from sqlalchemy.orm import aliased
from sqlmodel import Session, col, func, select

from app.models import (
    ActivityEvent,
    GroupMember,
    ModerationGroupFilter,
    ModerationWorkoutFilter,
    TrainingGroup,
    User,
    Workout,
    start_of_day,
)
from app.request_info import Client
from app.services import activity_service, group_service
from app.services.csv_export import EXPORT_LIMIT, describe_filters, to_csv, utc_text
from app.services.search import contains_any

Owner = aliased(User)
Assignee = aliased(User)

WORKOUTS_CSV_HEADER = [
    "id",
    "workout_date",
    "title",
    "notes",
    "owner_id",
    "owner",
    "owner_email",
    "group_id",
    "group",
    "assigned_to",
    "completed_at_utc",
    "created_at_utc",
    "updated_at_utc",
]
GROUPS_CSV_HEADER = ["id", "name", "owner_id", "owner", "owner_email", "members", "workouts", "created_at_utc"]


# --- Workouts ---


def _workout_conditions(f: ModerationWorkoutFilter) -> list:
    conditions = []
    if f.owner_id:
        conditions.append(col(Workout.owner_id) == f.owner_id)
    if f.group_id:
        conditions.append(col(Workout.group_id) == f.group_id)
    if f.status == "unassigned":
        conditions.append(col(Workout.assigned_to).is_(None))
    elif f.status == "to_do":
        conditions += [col(Workout.assigned_to).is_not(None), col(Workout.completed_at).is_(None)]
    elif f.status == "done":
        conditions.append(col(Workout.completed_at).is_not(None))
    if f.date_from:
        conditions.append(col(Workout.workout_date) >= f.date_from)
    if f.date_to:
        conditions.append(col(Workout.workout_date) <= f.date_to)
    if f.q:
        conditions.append(contains_any(f.q, Workout.title, Workout.notes, Owner.name, Owner.email))
    return conditions


def _workouts(conditions: list):
    """Matching workouts, latest workout date first, with the owner, group and assignee. The owner is outer-joined,
    so a workout whose owner's account is gone is still listed (and the search can use the owner's name)."""
    return (
        select(Workout, Owner.name, Owner.email, TrainingGroup.name, Assignee.name)
        .join(Owner, col(Workout.owner_id) == col(Owner.id), isouter=True)
        .join(TrainingGroup, col(Workout.group_id) == col(TrainingGroup.id), isouter=True)
        .join(Assignee, col(Workout.assigned_to) == col(Assignee.id), isouter=True)
        .where(*conditions)
        .order_by(col(Workout.workout_date).desc(), col(Workout.id).desc())
    )


def _workout_read(w: Workout, owner_name, owner_email, group_name, assignee_name) -> dict:
    return {
        "id": w.id,
        "title": w.title,
        "workout_date": w.workout_date,
        "notes": w.notes,
        "group_id": w.group_id,
        "group_name": group_name,
        "owner_id": w.owner_id,
        "owner_name": owner_name,
        "owner_email": owner_email,
        "assigned_to": w.assigned_to,
        "assigned_to_name": assignee_name,
        "completed_at": w.completed_at,
        "created_at": w.created_at,
        "updated_at": w.updated_at,
    }


def list_workouts(session: Session, f: ModerationWorkoutFilter, offset: int, limit: int) -> tuple[list[dict], int]:
    conditions = _workout_conditions(f)
    total = session.exec(
        select(func.count())
        .select_from(Workout)
        .join(Owner, col(Workout.owner_id) == col(Owner.id), isouter=True)
        .where(*conditions)
    ).one()
    rows = session.exec(_workouts(conditions).offset(offset).limit(limit)).all()
    return [_workout_read(*row) for row in rows], total


def export_workouts_csv(session: Session, f: ModerationWorkoutFilter, admin: User, client: Client) -> str:
    """The same rows and order as the list with the same filters, up to EXPORT_LIMIT. The download is logged."""
    rows = session.exec(_workouts(_workout_conditions(f)).limit(EXPORT_LIMIT)).all()
    text = to_csv(
        WORKOUTS_CSV_HEADER,
        (
            [
                w.id,
                w.workout_date.isoformat(),
                w.title,
                w.notes,
                w.owner_id,
                owner_name,
                owner_email,
                w.group_id,
                group_name,
                assignee_name,
                utc_text(w.completed_at),
                utc_text(w.created_at),
                utc_text(w.updated_at),
            ]
            for w, owner_name, owner_email, group_name, assignee_name in rows
        ),
    )
    filters = describe_filters(f.model_dump(exclude_none=True))
    activity_service.record(
        session, ActivityEvent.EXPORT, client, actor=admin, details=f"workouts.csv: {len(rows)} rows; {filters}"
    )
    session.commit()
    return text


def delete_workouts(session: Session, admin: User, ids: list[int], client: Client) -> int:
    """Delete these workouts in one transaction, one activity row each. Ids that match nothing are skipped."""
    rows = session.exec(
        select(Workout, Owner, TrainingGroup.name)
        .join(Owner, col(Workout.owner_id) == col(Owner.id), isouter=True)
        .join(TrainingGroup, col(Workout.group_id) == col(TrainingGroup.id), isouter=True)
        .where(col(Workout.id).in_(list(dict.fromkeys(ids))))
    ).all()
    for workout, owner, group_name in rows:
        where = f"in group {group_name}" if group_name else "in no group"
        activity_service.record(
            session,
            ActivityEvent.WORKOUT_DELETE,
            client,
            actor=admin,
            target=owner,
            details=f"{workout.title} ({workout.workout_date.isoformat()}, {where})",
        )
        session.delete(workout)
    session.commit()
    return len(rows)


# --- Groups ---


def _group_conditions(f: ModerationGroupFilter) -> list:
    conditions = []
    if f.owner_id:
        conditions.append(col(TrainingGroup.owner_id) == f.owner_id)
    if f.date_from:
        conditions.append(col(TrainingGroup.created_at) >= start_of_day(f.date_from))
    if f.date_to:
        conditions.append(col(TrainingGroup.created_at) < start_of_day(f.date_to + timedelta(days=1)))
    if f.q:
        conditions.append(or_(contains_any(f.q, TrainingGroup.name), contains_any(f.q, Owner.name, Owner.email)))
    return conditions


def _counted(subject, condition):
    return select(func.count()).select_from(subject).where(condition).correlate(TrainingGroup).scalar_subquery()


def _groups(conditions: list):
    """Matching groups, newest first, with the owner and how many people and workouts each has."""
    members = _counted(GroupMember, col(GroupMember.group_id) == col(TrainingGroup.id))
    workouts = _counted(Workout, col(Workout.group_id) == col(TrainingGroup.id))
    return (
        select(TrainingGroup, Owner.name, Owner.email, members, workouts)
        .join(Owner, col(TrainingGroup.owner_id) == col(Owner.id))
        .where(*conditions)
        .order_by(col(TrainingGroup.created_at).desc(), col(TrainingGroup.id).desc())
    )


def _group_read(g: TrainingGroup, owner_name: str, owner_email: str, members: int, workouts: int) -> dict:
    return {
        "id": g.id,
        "name": g.name,
        "owner_id": g.owner_id,
        "owner_name": owner_name,
        "owner_email": owner_email,
        "created_at": g.created_at,
        "member_count": members + 1,
        "workout_count": workouts,
    }


def list_groups(session: Session, f: ModerationGroupFilter, offset: int, limit: int) -> tuple[list[dict], int]:
    conditions = _group_conditions(f)
    total = session.exec(
        select(func.count())
        .select_from(TrainingGroup)
        .join(Owner, col(TrainingGroup.owner_id) == col(Owner.id))
        .where(*conditions)
    ).one()
    rows = session.exec(_groups(conditions).offset(offset).limit(limit)).all()
    return [_group_read(*row) for row in rows], total


def export_groups_csv(session: Session, f: ModerationGroupFilter, admin: User, client: Client) -> str:
    rows = session.exec(_groups(_group_conditions(f)).limit(EXPORT_LIMIT)).all()
    text = to_csv(
        GROUPS_CSV_HEADER,
        (
            [g.id, g.name, g.owner_id, owner_name, owner_email, members + 1, workouts, utc_text(g.created_at)]
            for g, owner_name, owner_email, members, workouts in rows
        ),
    )
    filters = describe_filters(f.model_dump(exclude_none=True))
    activity_service.record(
        session, ActivityEvent.EXPORT, client, actor=admin, details=f"groups.csv: {len(rows)} rows; {filters}"
    )
    session.commit()
    return text


def delete_groups(session: Session, admin: User, ids: list[int], client: Client) -> int:
    """Delete these groups with their workouts and memberships, in one transaction, one activity row each."""
    rows = session.exec(
        select(TrainingGroup, Owner, _counted(Workout, col(Workout.group_id) == col(TrainingGroup.id)))
        .join(Owner, col(TrainingGroup.owner_id) == col(Owner.id))
        .where(col(TrainingGroup.id).in_(list(dict.fromkeys(ids))))
    ).all()
    for group, owner, workouts in rows:
        activity_service.record(
            session,
            ActivityEvent.GROUP_DELETE,
            client,
            actor=admin,
            target=owner,
            details=f"{group.name}, with {workouts} workout{'' if workouts == 1 else 's'}",
        )
    if rows:
        group_service.delete_groups(session, [group.id for group, _, _ in rows])
    session.commit()
    return len(rows)
