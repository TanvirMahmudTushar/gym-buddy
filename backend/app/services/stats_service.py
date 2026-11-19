# The numbers on the admin dashboard.
from datetime import timedelta

from sqlmodel import Session, col, func, select

from app.models import User, utc_now, utc_today
from app.services import checkin_service, class_service
from app.services.member_service import IS_MEMBER


def _count_members(session: Session, *filters) -> int:
    return session.exec(select(func.count()).select_from(User).where(IS_MEMBER, *filters)).one()


def member_stats(session: Session) -> dict:
    """Same rules as the member list: a frozen member counts as frozen whatever its expiry date."""
    today = utc_today()
    not_frozen = col(User.is_frozen).is_(False)
    return {
        "total": _count_members(session),
        "active": _count_members(session, not_frozen, col(User.expires_on) >= today),
        "expired": _count_members(session, not_frozen, col(User.expires_on) < today),
        "frozen": _count_members(session, col(User.is_frozen).is_(True)),
        # Memberships started in the last 7 days (joined_on is a date, so today counts as day one).
        "new_last_7_days": _count_members(session, col(User.joined_on) > today - timedelta(days=7)),
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
    return {
        "members": member_stats(session),
        "users": user_stats(session),
        "check_ins": check_in_stats(session),
        "classes": class_service.class_stats(session),
    }
