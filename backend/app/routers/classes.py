# Classes and their bookings under /api/v1/classes (TDD 6.2).
# Anyone logged in can read classes; only gym managers and admins change them or see the bookings.
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.database import SessionDep
from app.deps import CurrentUser, require_roles
from app.models import BookingRead, BookingPage, ClassCreate, ClassPage, ClassRead, ClassUpdate, User
from app.services import class_service, member_service

router = APIRouter(prefix="/api/v1/classes", tags=["classes"])

Staff = Annotated[User, Depends(require_roles("gym_manager", "admin"))]


@router.post("", status_code=201, response_model=ClassRead)
def create_class(body: ClassCreate, session: SessionDep, staff: Staff) -> dict:
    return class_service.create_class(session, body, staff)


@router.get("", response_model=ClassPage)
def list_classes(
    session: SessionDep,
    user: CurrentUser,
    upcoming: bool = False,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict:
    """Ordered by start time. upcoming=true leaves out classes that have already started."""
    # is_booked_by_me is true for the classes this user has booked as a member.
    items, total = class_service.list_classes(session, upcoming, offset, limit, member_service.own_member_id(user))
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.get("/{class_id}", response_model=ClassRead)
def get_class(class_id: int, session: SessionDep, user: CurrentUser) -> dict:
    return class_service.get_class(session, class_id, member_service.own_member_id(user))


@router.patch("/{class_id}", response_model=ClassRead)
def update_class(class_id: int, body: ClassUpdate, session: SessionDep, _staff: Staff) -> dict:
    """Only the fields sent change. Capacity below the current bookings returns 422."""
    return class_service.update_class(session, class_id, body.model_dump(exclude_unset=True))


@router.delete("/{class_id}", status_code=204)
def delete_class(class_id: int, session: SessionDep, _staff: Staff) -> None:
    """Also deletes the class's bookings."""
    class_service.delete_class(session, class_id)


@router.get("/{class_id}/bookings", response_model=BookingPage)
def list_bookings(
    class_id: int,
    session: SessionDep,
    _staff: Staff,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> dict:
    items, total = class_service.list_bookings(session, class_id, offset, limit)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.post("/{class_id}/bookings", status_code=201, response_model=BookingRead)
def book_class(class_id: int, session: SessionDep, user: CurrentUser) -> dict:
    """Books a place for the logged-in user (404 if they have no membership).
    400 if the membership is not valid or the class has started; 409 if it is full or already booked."""
    return class_service.book_class(session, class_id, member_service.get_own_membership(user))


@router.delete("/{class_id}/bookings", status_code=204)
def cancel_booking(class_id: int, session: SessionDep, user: CurrentUser) -> None:
    """Cancels the logged-in user's own booking (404 if there is none)."""
    class_service.cancel_booking(session, class_id, member_service.get_own_membership(user))
