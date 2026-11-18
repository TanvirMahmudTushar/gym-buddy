# The numbers on the admin dashboard.
from datetime import timedelta

from sqlmodel import Session, col, func, select

from app.models import Member, User, utc_now, utc_today
from app.services import checkin_service


def _count(session: Session, *filters) -> int:
    return session.exec(select(func.count()).select_from(Member).where(*filters)).one()


def member_stats(session: Session) -> dict:
    """Same rules as the member list: a frozen member counts as frozen whatever its expiry date."""
    today = utc_today()
    active = col(Member.is_active).is_(True)
    return {
        "total": _count(session),
        "active": _count(session, active, Member.expires_on >= today),
        "expired": _count(session, active, Member.expires_on < today),
        "frozen": _count(session, col(Member.is_active).is_(False)),
        "new_last_7_days": _count(session, Member.created_at >= utc_now() - timedelta(days=7)),
    }


def user_stats(session: Session) -> dict:
    by_role = dict(session.exec(select(User.role, func.count()).group_by(User.role)).all())
    banned = session.exec(select(func.count()).select_from(User).where(col(User.is_banned).is_(True))).one()
    return {
        "total": sum(by_role.values()),
        "users": by_role.get("user", 0),
        "gym_managers": by_role.get("gym_manager", 0),
        "admins": by_role.get("admin", 0),
        "banned": banned,
    }


def check_in_stats(session: Session) -> dict:
    return {
        "today": checkin_service.count_since(session, checkin_service.start_of_today()),
        "last_7_days": checkin_service.count_since(session, utc_now() - timedelta(days=7)),
    }


def admin_stats(session: Session) -> dict:
    return {"members": member_stats(session), "users": user_stats(session), "check_ins": check_in_stats(session)}
