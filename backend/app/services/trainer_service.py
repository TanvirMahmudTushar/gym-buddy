# Trainers: who can be picked as one, a trainer's clients, and what happens when someone stops being a trainer.
from sqlmodel import Session, col, func, select, update

from app import rbac
from app.models import CheckIn, GymClass, User
from app.rbac import Permission


class TrainerNotFoundError(Exception):
    """The trainer_id sent is not an account with the Trainer role."""


def list_trainers(session: Session) -> list[User]:
    """Every account with the Trainer role, by name: the choices for a class or a member. A gym has only a few."""
    teachers = rbac.roles_with(Permission.CLASSES_TEACH)
    query = select(User).where(col(User.role).in_(teachers)).order_by(col(User.name), col(User.id))
    return list(session.exec(query).all())


def check_trainer(session: Session, trainer_id: int) -> None:
    """A class's or a member's trainer must be an account that can teach (the Trainer role)."""
    trainer = session.get(User, trainer_id)
    if trainer is None or not rbac.has_permission(trainer, Permission.CLASSES_TEACH):
        raise TrainerNotFoundError(trainer_id)


def list_clients(session: Session, trainer: User, offset: int, limit: int) -> tuple[list[dict], int]:
    """The members this trainer is the personal trainer of, by name, with their last visit."""
    mine = [col(User.trainer_id) == trainer.id, col(User.plan).is_not(None)]
    total = session.exec(select(func.count()).select_from(User).where(*mine)).one()
    last_visit = (
        select(func.max(CheckIn.checked_in_at))
        .where(col(CheckIn.member_id) == col(User.id))
        .correlate(User)
        .scalar_subquery()
    )
    rows = session.exec(
        select(User, last_visit).where(*mine).order_by(col(User.name), col(User.id)).offset(offset).limit(limit)
    ).all()
    return [{**member.model_dump(exclude={"password_hash"}), "last_visit_at": visit} for member, visit in rows], total


def release_trainer(session: Session, trainer: User) -> None:
    """When someone stops being a trainer, their classes keep their name as text, and their clients have no trainer
    until staff pick another. The caller commits."""
    session.exec(
        update(GymClass)
        .where(col(GymClass.trainer_id) == trainer.id)
        .values(trainer_id=None, trainer_name=trainer.name)
    )
    session.exec(update(User).where(col(User.trainer_id) == trainer.id).values(trainer_id=None))
