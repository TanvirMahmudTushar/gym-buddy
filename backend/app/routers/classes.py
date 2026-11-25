# Classes and their bookings under /api/v1/classes (TDD 6.2).
# Anyone logged in can read classes. Changing them needs classes:manage (gym managers and admins), which also opens
# every class's bookings; classes:teach (trainers) opens the bookings of the classes they teach.
from typing import Annotated

from fastapi import APIRouter, Depends

from app.database import SessionDep
from app.deps import CurrentUser
from app.models import (
    AttendanceUpdate,
    BookingPage,
    BookingRead,
    ClassCreate,
    ClassPage,
    ClassRead,
    ClassUpdate,
    User,
)
from app.params import Limit, Offset, RowId
from app.rbac import Permission, require_permission
from app.request_info import ClientDep
from app.services import class_service, member_service

router = APIRouter(prefix="/api/v1/classes", tags=["classes"])

ClassManager = Annotated[User, Depends(require_permission(Permission.CLASSES_MANAGE))]
MANAGE_CLASSES = Depends(require_permission(Permission.CLASSES_MANAGE))
# Either permission opens a class's bookings; class_service then limits a trainer to the classes they teach.
BookingViewer = Annotated[User, Depends(require_permission(Permission.CLASSES_MANAGE, Permission.CLASSES_TEACH))]


@router.post("", status_code=201, response_model=ClassRead)
def create_class(body: ClassCreate, session: SessionDep, manager: ClassManager) -> dict:
    """starts_at must be in the future, and trainer_id an account with the Trainer role or left out (422 otherwise)."""
    return class_service.create_class(session, body, manager)


@router.get("", response_model=ClassPage)
def list_classes(
    session: SessionDep,
    user: CurrentUser,
    upcoming: bool = False,
    offset: Offset = 0,
    limit: Limit = 20,
) -> dict:
    """Ordered by start time. upcoming=true leaves out classes that have already started."""
    # is_booked_by_me is true for the classes this user has booked as a member.
    items, total = class_service.list_classes(session, upcoming, offset, limit, member_service.own_member_id(user))
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.get("/{class_id}", response_model=ClassRead)
def get_class(class_id: RowId, session: SessionDep, user: CurrentUser) -> dict:
    return class_service.get_class(session, class_id, member_service.own_member_id(user))


@router.patch("/{class_id}", response_model=ClassRead, dependencies=[MANAGE_CLASSES])
def update_class(class_id: RowId, body: ClassUpdate, session: SessionDep) -> dict:
    """Only the fields sent change. Capacity below the current bookings returns 422. Sending trainer_id (a Trainer,
    or null for none) replaces the trainer and any old text name."""
    return class_service.update_class(session, class_id, body.model_dump(exclude_unset=True))


@router.delete("/{class_id}", status_code=204)
def delete_class(class_id: RowId, session: SessionDep, manager: ClassManager, client: ClientDep) -> None:
    """Also deletes the class's bookings. Written to the activity log."""
    class_service.delete_class(session, class_id, manager, client)


@router.get("/{class_id}/bookings", response_model=BookingPage)
def list_bookings(
    class_id: RowId,
    session: SessionDep,
    viewer: BookingViewer,
    offset: Offset = 0,
    limit: Limit = 50,
) -> dict:
    """Gym managers and admins: any class. A trainer: only the classes they teach (403 for the rest)."""
    items, total = class_service.list_bookings(session, class_id, offset, limit, viewer)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.put("/{class_id}/bookings/{member_id}/attendance", response_model=BookingRead)
def mark_attendance(
    class_id: RowId, member_id: RowId, body: AttendanceUpdate, session: SessionDep, viewer: BookingViewer
) -> dict:
    """Marks whether the member came (null clears it). Gym managers and admins: any class; a trainer: their own.
    400 until an hour before the class starts; 404 if the member has not booked it."""
    return class_service.mark_attendance(session, class_id, member_id, body.attended, viewer)


@router.post("/{class_id}/bookings", status_code=201, response_model=BookingRead)
def book_class(class_id: RowId, session: SessionDep, user: CurrentUser) -> dict:
    """Books a place for the logged-in user (404 if they have no membership).
    400 if the membership is not valid or the class has started; 409 if it is full or already booked."""
    return class_service.book_class(session, class_id, member_service.get_own_membership(user))


@router.delete("/{class_id}/bookings", status_code=204)
def cancel_booking(class_id: RowId, session: SessionDep, user: CurrentUser) -> None:
    """Cancels the logged-in user's own booking: 404 if there is none, 400 once the class has started."""
    class_service.cancel_booking(session, class_id, member_service.get_own_membership(user))
