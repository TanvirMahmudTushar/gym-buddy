# Revenue for the admin dashboard (SRS FR-52). Days and months are UTC calendar days, the same calendar the
# payments list filters use, so every number here matches the payments list for the same dates.
# Voided payments are never counted.
from datetime import date, timedelta

from sqlmodel import Session, col, func, select

from app.models import Payment, utc_today
from app.services.payment_service import start_of_day

METHOD_ORDER = ["cash", "card", "bank_transfer", "mobile_banking"]
LAST_DAYS = 30
MONTHS = 6


def _counted(since: date, before: date | None = None) -> list:
    """Payments that are not voided, paid from the start of `since` up to (not including) the start of `before`."""
    conditions = [col(Payment.voided_at).is_(None), col(Payment.paid_at) >= start_of_day(since)]
    if before is not None:
        conditions.append(col(Payment.paid_at) < start_of_day(before))
    return conditions


def _sum(session: Session, since: date, before: date | None = None) -> int:
    return session.exec(select(func.coalesce(func.sum(Payment.amount), 0)).where(*_counted(since, before))).one()


def _month_start(day: date, months_back: int = 0) -> date:
    """The first day of the month `months_back` months before the month of `day`."""
    index = day.year * 12 + (day.month - 1) - months_back
    return date(index // 12, index % 12 + 1, 1)


def revenue_stats(session: Session) -> dict:
    today = utc_today()
    since_30 = today - timedelta(days=LAST_DAYS - 1)  # 30 days counting today

    by_method = dict.fromkeys(METHOD_ORDER, (0, 0))
    rows = session.exec(
        select(Payment.method, func.sum(Payment.amount), func.count())
        .where(*_counted(since_30))
        .group_by(Payment.method)
    ).all()
    for method, amount, count in rows:
        by_method[method] = (amount, count)

    # One small query per month keeps this the same on SQLite and PostgreSQL (no date functions in SQL).
    months = []
    for back in range(MONTHS - 1, -1, -1):
        start = _month_start(today, back)
        months.append({"month": start.strftime("%Y-%m"), "amount": _sum(session, start, _month_start(start, -1))})

    return {
        "today": _sum(session, today),
        "this_month": _sum(session, _month_start(today)),
        "last_30_days": _sum(session, since_30),
        "last_30_days_from": since_30,
        "by_method": [{"method": m, "amount": a, "count": c} for m, (a, c) in by_method.items()],
        "months": months,
    }
