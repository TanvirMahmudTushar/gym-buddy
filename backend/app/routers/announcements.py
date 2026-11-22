# Announcements under /api/v1/announcements (TDD 6.2): holiday hours, new classes and other news from the gym.
# Anyone logged in reads the current ones; announcements:manage (gym managers and admins) posts, edits and deletes.
# Routes only handle HTTP; the rules live in app/services/announcement_service.py.
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from app import rbac
from app.database import SessionDep
from app.deps import CurrentUser
from app.models import AnnouncementCreate, AnnouncementPage, AnnouncementRead, AnnouncementUpdate, User
from app.rbac import Permission, require_permission
from app.services import announcement_service

router = APIRouter(prefix="/api/v1/announcements", tags=["announcements"])

Poster = Annotated[User, Depends(require_permission(Permission.ANNOUNCEMENTS_MANAGE))]
MANAGE_ANNOUNCEMENTS = Depends(require_permission(Permission.ANNOUNCEMENTS_MANAGE))


@router.get("", response_model=AnnouncementPage)
def list_announcements(
    session: SessionDep,
    user: CurrentUser,
    include_ended: bool = False,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict:
    """Newest first. Only current ones (no end date, or an end date of today or later, UTC) unless
    include_ended=true, which needs announcements:manage (403 for the rest)."""
    # The route is open to everyone logged in, so this one option is checked here, with the same permission.
    if include_ended and not rbac.has_permission(user, Permission.ANNOUNCEMENTS_MANAGE):
        raise HTTPException(status_code=403, detail="You do not have permission to do this")
    items, total = announcement_service.list_announcements(session, include_ended, offset, limit)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.post("", status_code=201, response_model=AnnouncementRead)
def create_announcement(body: AnnouncementCreate, session: SessionDep, poster: Poster) -> dict:
    """ends_on is the last day it shows (UTC); left out, it shows until it is deleted. A day before today returns 422."""
    return announcement_service.create_announcement(session, body, poster)


@router.patch("/{announcement_id}", response_model=AnnouncementRead, dependencies=[MANAGE_ANNOUNCEMENTS])
def update_announcement(announcement_id: int, body: AnnouncementUpdate, session: SessionDep) -> dict:
    """Only the fields sent change. ends_on null removes the end date; a day before today returns 422."""
    return announcement_service.update_announcement(session, announcement_id, body.model_dump(exclude_unset=True))


@router.delete("/{announcement_id}", status_code=204, dependencies=[MANAGE_ANNOUNCEMENTS])
def delete_announcement(announcement_id: int, session: SessionDep) -> None:
    announcement_service.delete_announcement(session, announcement_id)
