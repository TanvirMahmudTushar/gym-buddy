# The numbers on the admin dashboard.
from datetime import timedelta

from sqlmodel import Session, col, func, select

from app.models import User, utc_now, utc_today
from app.services import checkin_service, class_service, group_service, payment_service, workout_service
from app.services.member_service import IS_MEMBER, WAITING, status_filters

# "New" and "last 7 days" on the dashboard: a rolling week back from now.
WEEK = timedelta(days=7)

# How many of the next classes the overview shows.
NEXT_CLASSES = 5


def _count_members(session: Session, *filters) -> int:
    return session.exec(select(func.count()).select_from(User).where(IS_MEMBER, *filters)).one()


def member_stats(session: Session) -> dict:
    """The member list's own filters, so each number matches the list with that filter chip."""
    today = utc_today()
    return {
        "total": _count_members(session),
        "active": _count_members(session, *status_filters("active")),
        "expired": _count_members(session, *status_filters("expired")),
        "frozen": _count_members(session, *status_filters("frozen")),
        # Memberships started in the last 7 days (joined_on is a date, so today counts as day one).
        "new_last_7_days": _count_members(session, col(User.joined_on) > today - timedelta(days=7)),
        "expiring_soon": _count_members(session, *status_filters("expiring_soon")),
    }


def user_stats(session: Session) -> dict:
    by_role = dict(session.exec(select(User.role, func.count()).group_by(User.role)).all())
    banned = session.exec(select(func.count()).select_from(User).where(col(User.is_banned).is_(True))).one()
    new = session.exec(select(func.count()).select_from(User).where(col(User.created_at) >= utc_now() - WEEK)).one()
    return {
        "total": sum(by_role.values()),
        "users": by_role.get("user", 0),
        "trainers": by_role.get("trainer", 0),
        "gym_managers": by_role.get("gym_manager", 0),
        "admins": by_role.get("admin", 0),
        "banned": banned,
        "new_last_7_days": new,
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
        "workouts": workout_service.workout_stats(session, utc_now() - WEEK),
        "groups": {"total": group_service.count_groups(session)},
    }


def staff_overview(session: Session) -> dict:
    """The Gym Manager's start page. Each number is computed the way the page it links to computes its list:
    Checked in today, the Expiring soon filter, the waiting list and the payments list for today."""
    count, amount = payment_service.totals_since(session, utc_today())
    next_classes, _ = class_service.list_classes(session, upcoming=True, offset=0, limit=NEXT_CLASSES)
    return {
        "check_ins_today": checkin_service.count_since(session, checkin_service.start_of_today()),
        "expiring_soon": _count_members(session, *status_filters("expiring_soon")),
        "waiting": session.exec(select(func.count()).select_from(User).where(*WAITING)).one(),
        "payments_today": {"count": count, "amount": amount},
        "next_classes": next_classes,
    }
