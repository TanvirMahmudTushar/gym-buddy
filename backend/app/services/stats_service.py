# The numbers on the Dashboard: the front desk part (gym managers and admins) and the admin part.
from datetime import timedelta

from sqlmodel import Session, col, func, select

from app.models import User, gym_today, utc_now
from app.services import (
    checkin_service,
    class_service,
    equipment_service,
    group_service,
    payment_service,
    workout_service,
)
from app.services.member_service import IS_MEMBER, WAITING, status_filters

# "New" and "last 7 days" on the dashboard: a rolling week back from now.
WEEK = timedelta(days=7)

# How many of the next classes the overview shows.
NEXT_CLASSES = 5


def member_stats(session: Session) -> dict:
    """The member list's own filters, so each number matches the list with that filter chip. One query: each count
    takes only the rows its own FILTER allows."""

    def count(*filters):
        return func.count().filter(IS_MEMBER, *filters)

    total, active, expired, frozen, new, expiring_soon = session.exec(
        select(
            count(),
            count(*status_filters("active")),
            count(*status_filters("expired")),
            count(*status_filters("frozen")),
            # Memberships started in the last 7 days (joined_on is a date, so today counts as day one).
            count(col(User.joined_on) > gym_today() - timedelta(days=7)),
            count(*status_filters("expiring_soon")),
        ).select_from(User)
    ).one()
    return {
        "total": total,
        "active": active,
        "expired": expired,
        "frozen": frozen,
        "new_last_7_days": new,
        "expiring_soon": expiring_soon,
    }


def user_stats(session: Session) -> dict:
    def role(name: str):
        return func.count().filter(col(User.role) == name)

    total, users, trainers, gym_managers, admins, banned, new = session.exec(
        select(
            func.count(),
            role("user"),
            role("trainer"),
            role("gym_manager"),
            role("admin"),
            func.count().filter(col(User.is_banned).is_(True)),
            func.count().filter(col(User.created_at) >= utc_now() - WEEK),
        ).select_from(User)
    ).one()
    return {
        "total": total,
        "users": users,
        "trainers": trainers,
        "gym_managers": gym_managers,
        "admins": admins,
        "banned": banned,
        "new_last_7_days": new,
    }


def admin_stats(session: Session) -> dict:
    return {
        "members": member_stats(session),
        "users": user_stats(session),
        "check_ins": checkin_service.check_in_stats(session),
        "classes": class_service.class_stats(session),
        "workouts": workout_service.workout_stats(session, utc_now() - WEEK),
        "groups": {"total": group_service.count_groups(session)},
        "equipment": equipment_service.equipment_stats(session),
    }


def staff_overview(session: Session) -> dict:
    """The front desk part of the Dashboard. Each number is computed the way the page it links to computes its list:
    Attendance, the Expiring soon filter, the waiting list, the payments list for today and the Equipment filters."""
    equipment = equipment_service.equipment_stats(session)
    count, amount = payment_service.totals_since(session, gym_today())
    check_ins_today, inside_now = checkin_service.today_counts(session)
    expiring_soon, waiting = session.exec(
        select(
            func.count().filter(IS_MEMBER, *status_filters("expiring_soon")), func.count().filter(*WAITING)
        ).select_from(User)
    ).one()
    next_classes, _ = class_service.list_classes(session, upcoming=True, offset=0, limit=NEXT_CLASSES)
    return {
        "check_ins_today": check_ins_today,
        "inside_now": inside_now,
        "expiring_soon": expiring_soon,
        "waiting": waiting,
        "payments_today": {"count": count, "amount": amount},
        "equipment_attention": equipment["needs_attention"],
        "equipment_service_due": equipment["service_due"],
        "next_classes": next_classes,
    }
