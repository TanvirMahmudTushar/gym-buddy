# Trainers under /api/v1/trainers (TDD 6.2): the choices for a class's trainer, and a trainer's own classes.
# A class's bookings stay under /api/v1/classes/{class_id}/bookings, which a trainer may read for their own classes.
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.database import SessionDep
from app.deps import require_roles
from app.models import ClassPage, TrainerRead, User
from app.services import class_service, user_service
from app.services.class_service import When

router = APIRouter(prefix="/api/v1/trainers", tags=["trainers"])

Staff = Annotated[User, Depends(require_roles("gym_manager", "admin"))]
Trainer = Annotated[User, Depends(require_roles("trainer"))]


@router.get("", response_model=list[TrainerRead])
def list_trainers(session: SessionDep, _staff: Staff) -> list[User]:
    """Every account with the Trainer role, by name, for the class form. Not paged (like /plans): a gym has few."""
    return user_service.list_trainers(session)


@router.get("/me/classes", response_model=ClassPage)
def list_my_classes(
    session: SessionDep,
    trainer: Trainer,
    when: When = "upcoming",
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict:
    """The classes I teach: upcoming ones soonest first (the default), or past ones latest first. Trainers only."""
    items, total = class_service.list_trainer_classes(session, trainer.id, when, offset, limit)
    return {"items": items, "total": total, "offset": offset, "limit": limit}
