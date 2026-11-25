# Announcements: news from the gym that everyone logged in reads, posted by gym managers and admins
# (SRS FR-72 to FR-76). Used by the routes in app/routers/announcements.py.
from sqlmodel import Session, col, func, or_, select

from app.models import ActivityEvent, Announcement, AnnouncementCreate, User, gym_today, utc_now
from app.request_info import Client
from app.services import activity_service


class AnnouncementNotFoundError(Exception):
    """No announcement has the given ID."""


def _is_current():
    """Not past its end date. The end date still counts; no end date means it never ends."""
    return or_(col(Announcement.ends_on).is_(None), col(Announcement.ends_on) >= gym_today())


def _read(announcement: Announcement, posted_by_name: str | None) -> dict:
    return {**announcement.model_dump(exclude={"posted_by"}), "posted_by_name": posted_by_name}


def _poster_name(session: Session, announcement: Announcement) -> str | None:
    """The name one announcement shows; the list gets it from an outer join in the same query instead."""
    if announcement.posted_by is None:
        return None
    poster = session.get(User, announcement.posted_by)
    return poster.name if poster else None


def _get(session: Session, announcement_id: int) -> Announcement:
    announcement = session.get(Announcement, announcement_id)
    if announcement is None:
        raise AnnouncementNotFoundError(announcement_id)
    return announcement


def list_announcements(session: Session, include_ended: bool, offset: int, limit: int) -> tuple[list[dict], int]:
    """One page, newest first, plus how many match. Only current ones unless include_ended is true."""
    filters = [] if include_ended else [_is_current()]
    total = session.exec(select(func.count()).select_from(Announcement).where(*filters)).one()
    query = (
        select(Announcement, col(User.name))
        # Outer join: an announcement stays listed after the account that posted it is deleted.
        .join(User, col(Announcement.posted_by) == col(User.id), isouter=True)
        .where(*filters)
        .order_by(col(Announcement.posted_at).desc(), col(Announcement.id).desc())
        .offset(offset)
        .limit(limit)
    )
    return [_read(announcement, name) for announcement, name in session.exec(query).all()], total


def create_announcement(session: Session, data: AnnouncementCreate, posted_by: User) -> dict:
    announcement = Announcement(**data.model_dump(), posted_by=posted_by.id)
    session.add(announcement)
    session.commit()
    session.refresh(announcement)
    return _read(announcement, posted_by.name)


def update_announcement(session: Session, announcement_id: int, changes: dict) -> dict:
    """Apply only the given fields. The poster and the posting time stay; updated_at records the edit."""
    announcement = _get(session, announcement_id)
    if changes:
        announcement.sqlmodel_update(changes)
        announcement.updated_at = utc_now()
        session.add(announcement)
        session.commit()
        session.refresh(announcement)
    return _read(announcement, _poster_name(session, announcement))


def delete_announcement(session: Session, announcement_id: int, actor: User, client: Client) -> None:
    announcement = _get(session, announcement_id)
    activity_service.record(
        session, ActivityEvent.ANNOUNCEMENT_DELETE, client, actor=actor, details=announcement.title
    )
    session.delete(announcement)
    session.commit()
