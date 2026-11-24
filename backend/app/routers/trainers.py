# Trainers under /api/v1/trainers (TDD 6.2): the choices for a class's or a member's trainer, and a trainer's own
# classes and clients.
# A class's bookings stay under /api/v1/classes/{class_id}/bookings, which a trainer may read for their own classes.
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.database import SessionDep
from app.models import ClassPage, ClientPage, TrainerRead, User
from app.rbac import Permission, require_permission
from app.services import class_service, trainer_service
from app.services.class_service import When

router = APIRouter(prefix="/api/v1/trainers", tags=["trainers"])

# The trainer list is for whoever manages classes or members; "my classes" and "my clients" for the Trainer role.
PICK_TRAINER = Depends(require_permission(Permission.CLASSES_MANAGE, Permission.MEMBERS_MANAGE))
ClientReader = Annotated[User, Depends(require_permission(Permission.CLIENTS_READ))]
Teacher = Annotated[User, Depends(require_permission(Permission.CLASSES_TEACH))]


@router.get("", response_model=list[TrainerRead], dependencies=[PICK_TRAINER])
def list_trainers(session: SessionDep) -> list[User]:
    """Every account with the Trainer role, by name, for the class and member forms. Not paged: a gym has few."""
    return trainer_service.list_trainers(session)


@router.get("/me/classes", response_model=ClassPage)
def list_my_classes(
    session: SessionDep,
    trainer: Teacher,
    when: When = "upcoming",
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict:
    """The classes I teach: upcoming ones soonest first (the default), or past ones latest first. Trainers only."""
    items, total = class_service.list_trainer_classes(session, trainer.id, when, offset, limit)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.get("/me/clients", response_model=ClientPage)
def list_my_clients(
    session: SessionDep,
    trainer: ClientReader,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict:
    """The members I am the personal trainer of, by name, with their phone, membership and last visit. Never anyone
    else's clients, and no payments, notes or date of birth."""
    items, total = trainer_service.list_clients(session, trainer, offset, limit)
    return {"items": items, "total": total, "offset": offset, "limit": limit}
