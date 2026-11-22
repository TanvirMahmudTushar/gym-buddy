# The activity log (final spec 2.3, SRS 3.7i): security events with who did them, to which account, from where
# and when, and the failed-login summary for the Security page.
#
# Services call record() before they commit the change it describes, so a ban and its log row are saved together
# or not at all. A failure that raises (a wrong password) commits its row first, so the row is kept.
# No caller ever passes a password, a password hash or a token: details are built from names, roles, reasons and
# ids only (NFR-23).
from datetime import datetime, timedelta

from sqlmodel import Session, col, func, or_, select

from app.models import ActivityEvent, ActivityFilter, ActivityLog, User, start_of_day, utc_now
from app.request_info import Client
from app.services.csv_export import describe_filters, to_csv, utc_text
from app.services.search import contains_any

# The CSV holds at most this many rows (newest first), so one download cannot outgrow a serverless function.
EXPORT_LIMIT = 10_000
# How many addresses and accounts the Security page lists for each window.
TOP_GROUPS = 10

CSV_HEADER = [
    "id",
    "time_utc",
    "event",
    "actor_id",
    "actor_email",
    "target_id",
    "target_email",
    "details",
    "ip",
    "user_agent",
]


def record(
    session: Session,
    event: ActivityEvent,
    client: Client | None,
    *,
    actor: User | None = None,
    actor_email: str | None = None,
    target: User | None = None,
    target_email: str | None = None,
    details: str | None = None,
) -> None:
    """Add one row; the caller commits. The emails default to the accounts' own; a failed login passes the email
    that was typed, and a deleted account passes its email without the account."""
    session.add(
        ActivityLog(
            event=event.value,
            actor_id=actor.id if actor else None,
            actor_email=actor_email or (actor.email if actor else None),
            target_id=target.id if target else None,
            target_email=target_email or (target.email if target else None),
            details=details[:500] if details else None,
            ip=client.ip if client else None,
            user_agent=client.user_agent if client else None,
        )
    )


def _conditions(f: ActivityFilter) -> list:
    conditions = []
    if f.event:
        conditions.append(col(ActivityLog.event) == f.event.value)
    if f.user_id:
        conditions.append(or_(col(ActivityLog.actor_id) == f.user_id, col(ActivityLog.target_id) == f.user_id))
    if f.date_from:
        conditions.append(col(ActivityLog.created_at) >= start_of_day(f.date_from))
    if f.date_to:
        # date_to is inclusive: everything before the start of the next day.
        conditions.append(col(ActivityLog.created_at) < start_of_day(f.date_to + timedelta(days=1)))
    if f.q:
        conditions.append(
            contains_any(f.q, ActivityLog.actor_email, ActivityLog.target_email, ActivityLog.ip, ActivityLog.details)
        )
    return conditions


def _newest_first(conditions: list):
    return (
        select(ActivityLog).where(*conditions).order_by(col(ActivityLog.created_at).desc(), col(ActivityLog.id).desc())
    )


def list_activity(session: Session, f: ActivityFilter, offset: int, limit: int) -> tuple[list[ActivityLog], int]:
    """One page of matching events, newest first, plus how many match in all."""
    conditions = _conditions(f)
    total = session.exec(select(func.count()).select_from(ActivityLog).where(*conditions)).one()
    return list(session.exec(_newest_first(conditions).offset(offset).limit(limit)).all()), total


def export_csv(session: Session, f: ActivityFilter, actor: User, client: Client) -> str:
    """The same rows as the list with the same filters, newest first, up to EXPORT_LIMIT. The export itself is
    logged after the rows are read, so it is not in its own file."""
    rows = session.exec(_newest_first(_conditions(f)).limit(EXPORT_LIMIT)).all()
    text = to_csv(
        CSV_HEADER,
        (
            [
                r.id,
                utc_text(r.created_at),
                r.event,
                r.actor_id,
                r.actor_email,
                r.target_id,
                r.target_email,
                r.details,
                r.ip,
                r.user_agent,
            ]
            for r in rows
        ),
    )
    filters = describe_filters(f.model_dump(exclude_none=True))
    record(session, ActivityEvent.EXPORT, client, actor=actor, details=f"activity.csv: {len(rows)} rows; {filters}")
    session.commit()
    return text


def _count(session: Session, *conditions) -> int:
    return session.exec(select(func.count()).select_from(ActivityLog).where(*conditions)).one()


def _failed_logins_since(session: Session, since: datetime) -> dict:
    failed = [col(ActivityLog.event) == ActivityEvent.LOGIN_FAILED.value, col(ActivityLog.created_at) >= since]
    count = func.count().label("n")
    last_at = func.max(ActivityLog.created_at).label("last_at")

    by_ip = session.exec(
        select(ActivityLog.ip, count, func.count(func.distinct(ActivityLog.actor_email)), last_at)
        .where(*failed)
        .group_by(col(ActivityLog.ip))
        .order_by(count.desc(), last_at.desc())
        .limit(TOP_GROUPS)
    ).all()
    # actor_id is set when the email belongs to an account; max() picks it out of the group (the rest are null).
    by_account = session.exec(
        select(
            ActivityLog.actor_email,
            func.max(ActivityLog.actor_id),
            count,
            func.count(func.distinct(ActivityLog.ip)),
            last_at,
        )
        .where(*failed)
        .group_by(col(ActivityLog.actor_email))
        .order_by(count.desc(), last_at.desc())
        .limit(TOP_GROUPS)
    ).all()
    return {
        "since": since,
        "total": _count(session, *failed),
        "lockouts": _count(
            session, col(ActivityLog.event) == ActivityEvent.ACCOUNT_LOCKED.value, col(ActivityLog.created_at) >= since
        ),
        "by_ip": [{"ip": ip, "count": n, "accounts": accounts, "last_at": last} for ip, n, accounts, last in by_ip],
        "by_account": [
            {"email": email or "", "user_id": user_id, "count": n, "ips": ips, "last_at": last}
            for email, user_id, n, ips, last in by_account
        ],
    }


def security_summary(session: Session) -> dict:
    """Failed logins in the last 24 hours and the last 7 days (rolling, from now), by IP address and by account."""
    now = utc_now()
    return {
        "last_24_hours": _failed_logins_since(session, now - timedelta(hours=24)),
        "last_7_days": _failed_logins_since(session, now - timedelta(days=7)),
    }
