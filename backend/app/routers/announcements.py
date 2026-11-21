# Announcements under /api/v1/announcements (TDD 6.2): holiday hours, new classes and other news from the gym.
# Anyone logged in reads the current ones; gym managers and admins post, edit and delete them.
# Routes only handle HTTP; the rules live in app/services/announcement_service.py.
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from app.database import SessionDep
from app.deps import CurrentUser, require_roles
from app.models import AnnouncementCreate, AnnouncementPage, AnnouncementRead, AnnouncementUpdate, User
from app.services import announcement_service

router = APIRouter(prefix="/api/v1/announcements", tags=["announcements"])

STAFF_ROLES = ("gym_manager", "admin")
Staff = Annotated[User, Depends(require_roles(*STAFF_ROLES))]


@router.get("", response_model=AnnouncementPage)
def list_announcements(
    session: SessionDep,
    user: CurrentUser,
    include_ended: bool = False,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict:
    """Newest first. Only current ones (no end date, or an end date of today or later, UTC) unless
    include_ended=true, which only gym managers and admins may ask for (403 for the rest)."""
    if include_ended and user.role not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="You do not have permission to do this")
    items, total = announcement_service.list_announcements(session, include_ended, offset, limit)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.post("", status_code=201, response_model=AnnouncementRead)
def create_announcement(body: AnnouncementCreate, session: SessionDep, staff: Staff) -> dict:
    """ends_on is the last day it shows (UTC); left out, it shows until it is deleted. A day before today returns 422."""
    return announcement_service.create_announcement(session, body, staff)


@router.patch("/{announcement_id}", response_model=AnnouncementRead)
def update_announcement(announcement_id: int, body: AnnouncementUpdate, session: SessionDep, _staff: Staff) -> dict:
    """Only the fields sent change. ends_on null removes the end date; a day before today returns 422."""
    return announcement_service.update_announcement(session, announcement_id, body.model_dump(exclude_unset=True))


@router.delete("/{announcement_id}", status_code=204)
def delete_announcement(announcement_id: int, session: SessionDep, _staff: Staff) -> None:
    announcement_service.delete_announcement(session, announcement_id)
