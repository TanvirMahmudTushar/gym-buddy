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
# How many addresses and accounts the Security page lists.
TOP_GROUPS = 10
# What the Security page counts as a hostile request. A lockout is only the result of failed logins, so it is not one.
HOSTILE_EVENTS = [
    ActivityEvent.LOGIN_FAILED.value,
    ActivityEvent.AUTH_REJECTED.value,
    ActivityEvent.ACCESS_DENIED.value,
]
# One address gets at most one auth_rejected row in this time.
AUTH_REJECTED_INTERVAL = timedelta(minutes=1)
# The emails shown for each address, and the most rows read to find them.
EMAILS_SHOWN = 5
EMAIL_ROWS = 1000

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


def record_auth_rejected(session: Session, client: Client) -> None:
    """Log a rejected access token, but at most once a minute for each address. Anyone can send a made-up token, so
    without this a script could add a row for every request. The caller commits. A flood still shows on the Security page,
    but as one row a minute, so its count is lower than the number of requests."""
    recent = [
        col(ActivityLog.event) == ActivityEvent.AUTH_REJECTED.value,
        col(ActivityLog.created_at) >= utc_now() - AUTH_REJECTED_INTERVAL,
        col(ActivityLog.ip) == client.ip if client.ip else col(ActivityLog.ip).is_(None),
    ]
    if _count(session, *recent) == 0:
        record(session, ActivityEvent.AUTH_REJECTED, client, details="The access token was not valid")


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


def _by_ip(session: Session, hostile: list, min_count: int) -> list[dict]:
    """The addresses with the most hostile requests, each with what happened, the emails and a browser. One grouped
    query ranks the addresses; two more, limited to those addresses, fill in the rest."""
    count = func.count().label("n")
    last_at = func.max(ActivityLog.created_at).label("last_at")
    top = session.exec(
        select(
            ActivityLog.ip,
            count,
            func.count(func.distinct(ActivityLog.actor_email)),
            func.max(ActivityLog.user_agent),
            last_at,
        )
        .where(*hostile)
        .group_by(col(ActivityLog.ip))
        .having(func.count() >= min_count)
        .order_by(count.desc(), last_at.desc())
        .limit(TOP_GROUPS)
    ).all()
    if not top:
        return []

    # `ip = NULL` never matches, so an unknown address is matched with IS NULL.
    known = [row[0] for row in top if row[0] is not None]
    on_these = col(ActivityLog.ip).in_(known)
    if len(known) < len(top):
        on_these = or_(on_these, col(ActivityLog.ip).is_(None))

    events: dict[str | None, list[tuple[str, int]]] = {}
    for ip, event, n in session.exec(
        select(ActivityLog.ip, ActivityLog.event, func.count())
        .where(*hostile, on_these)
        .group_by(col(ActivityLog.ip), col(ActivityLog.event))
    ).all():
        events.setdefault(ip, []).append((event, n))

    # Most recent first. Capped, so an address trying thousands of emails cannot make this query large.
    emails: dict[str | None, list[str]] = {}
    newest = func.max(ActivityLog.created_at)
    for ip, email, _ in session.exec(
        select(ActivityLog.ip, ActivityLog.actor_email, newest)
        .where(*hostile, on_these, col(ActivityLog.actor_email).is_not(None))
        .group_by(col(ActivityLog.ip), col(ActivityLog.actor_email))
        .order_by(newest.desc())
        .limit(EMAIL_ROWS)
    ).all():
        if len(emails.setdefault(ip, [])) < EMAILS_SHOWN:
            emails[ip].append(email)

    return [
        {
            "ip": ip,
            "count": n,
            "events": [{"event": e, "count": c} for e, c in sorted(events.get(ip, []), key=lambda ec: -ec[1])],
            "accounts": accounts,
            "emails": emails.get(ip, []),
            "user_agent": agent,
            "last_at": last,
        }
        for ip, n, accounts, agent, last in top
    ]


def _by_account(session: Session, since: datetime, min_count: int) -> list[dict]:
    """The emails with the most failed logins. Rejected tokens and denied requests carry no typed email."""
    count = func.count().label("n")
    last_at = func.max(ActivityLog.created_at).label("last_at")
    # actor_id is set when the email belongs to an account; max() picks it out of the group (the rest are null).
    rows = session.exec(
        select(
            ActivityLog.actor_email,
            func.max(ActivityLog.actor_id),
            count,
            func.count(func.distinct(ActivityLog.ip)),
            last_at,
        )
        .where(col(ActivityLog.event) == ActivityEvent.LOGIN_FAILED.value, col(ActivityLog.created_at) >= since)
        .group_by(col(ActivityLog.actor_email))
        .having(func.count() >= min_count)
        .order_by(count.desc(), last_at.desc())
        .limit(TOP_GROUPS)
    ).all()
    return [
        {"email": email or "", "user_id": user_id, "count": n, "ips": ips, "last_at": last}
        for email, user_id, n, ips, last in rows
    ]


def security_summary(session: Session, hours: int, min_count: int) -> dict:
    """Failed logins, rejected tokens and denied requests in the last `hours` hours (rolling, from now), by IP address
    and, for failed logins, by email. Only those with at least `min_count` are listed."""
    since = utc_now() - timedelta(hours=hours)
    in_window = col(ActivityLog.created_at) >= since
    hostile = [col(ActivityLog.event).in_(HOSTILE_EVENTS), in_window]
    return {
        "since": since,
        "hours": hours,
        "min_count": min_count,
        "total": _count(session, *hostile),
        "failed_logins": _count(session, col(ActivityLog.event) == ActivityEvent.LOGIN_FAILED.value, in_window),
        "lockouts": _count(session, col(ActivityLog.event) == ActivityEvent.ACCOUNT_LOCKED.value, in_window),
        "by_ip": _by_ip(session, hostile, min_count),
        "by_account": _by_account(session, since, min_count),
    }
