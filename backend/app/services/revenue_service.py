# Revenue for the admin dashboard (SRS FR-52). Days and months are the gym's calendar days, the same calendar the
# payments list filters use, so every number here matches the payments list for the same dates.
# Voided payments are never counted. Net income is revenue minus the expenses dated in the same month.
from datetime import date, timedelta

from sqlmodel import Session, col, func, select

from app.models import Payment, gym_today, start_of_day
from app.services import expense_service

METHOD_ORDER = ["cash", "card", "bank_transfer", "mobile_banking"]
LAST_DAYS = 30
MONTHS = 6


def _counted(since: date, before: date | None = None) -> list:
    """Payments that are not voided, paid from the start of `since` up to (not including) the start of `before`."""
    conditions = [col(Payment.voided_at).is_(None), col(Payment.paid_at) >= start_of_day(since)]
    if before is not None:
        conditions.append(col(Payment.paid_at) < start_of_day(before))
    return conditions


def _sum(since: date, before: date | None = None):
    """The total of the payments in a period, as one column of a query."""
    return func.coalesce(func.sum(Payment.amount).filter(*_counted(since, before)), 0)


def _month_start(day: date, months_back: int = 0) -> date:
    """The first day of the month `months_back` months before the month of `day`."""
    index = day.year * 12 + (day.month - 1) - months_back
    return date(index // 12, index % 12 + 1, 1)


def revenue_stats(session: Session) -> dict:
    today = gym_today()
    since_30 = today - timedelta(days=LAST_DAYS - 1)  # 30 days counting today

    by_method = dict.fromkeys(METHOD_ORDER, (0, 0))
    rows = session.exec(
        select(Payment.method, func.sum(Payment.amount), func.count())
        .where(*_counted(since_30))
        .group_by(Payment.method)
    ).all()
    for method, amount, count in rows:
        by_method[method] = (amount, count)

    # Each month is a range of dates, which is the same on SQLite and PostgreSQL (no date functions in SQL).
    starts = [_month_start(today, back) for back in range(MONTHS - 1, -1, -1)]
    periods = [(start, _month_start(start, -1)) for start in starts]
    taken_today, taken_30_days, *taken = session.exec(
        select(_sum(today), _sum(since_30), *(_sum(start, end) for start, end in periods)).where(
            *_counted(min(since_30, starts[0]))
        )
    ).one()
    spent = expense_service.totals_for(session, periods)
    months = [
        {"month": start.strftime("%Y-%m"), "amount": amount, "expenses": expenses, "net": amount - expenses}
        for start, amount, expenses in zip(starts, taken, spent)
    ]

    return {
        "today": taken_today,
        # The last month in the list is this month so far.
        "this_month": months[-1]["amount"],
        "expenses_this_month": months[-1]["expenses"],
        "net_this_month": months[-1]["net"],
        "last_30_days": taken_30_days,
        "last_30_days_from": since_30,
        "by_method": [{"method": m, "amount": a, "count": c} for m, (a, c) in by_method.items()],
        "months": months,
    }
