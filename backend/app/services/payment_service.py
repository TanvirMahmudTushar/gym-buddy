# Taking payments at the front desk, renewing a membership with them, and finding, voiding and exporting them
# (SRS FR-43 to FR-51).
import csv
import io
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy.orm import aliased
from sqlmodel import Session, col, func, select, update

from app.models import (
    DEFAULT_PLAN_PRICES,
    Payment,
    PaymentCreate,
    PaymentFilter,
    PlanPrice,
    User,
    as_utc,
    utc_now,
    utc_today,
)
from app.services import member_service

PLAN_ORDER = ["monthly", "quarterly", "yearly"]

# The staff who recorded and voided a payment: two joins on the same table, so each needs its own name.
Recorder = aliased(User)
Voider = aliased(User)

CSV_HEADER = [
    "id",
    "paid_at_utc",
    "member",
    "member_id",
    "amount_taka",
    "method",
    "plan",
    "renewed_until",
    "note",
    "recorded_by",
    "voided_at_utc",
    "void_reason",
    "voided_by",
]

# A cell starting with one of these could run as a formula when the CSV is opened in a spreadsheet.
_FORMULA_START = ("=", "+", "-", "@", "\t", "\r")


class PaymentNotFoundError(Exception):
    """No payment has the given ID."""


def get_plan_price(session: Session, plan: str) -> PlanPrice:
    """The price and length of a plan. The rows are filled in on first start; this covers a missing one."""
    row = session.get(PlanPrice, plan)
    if row is None:
        price, days = DEFAULT_PLAN_PRICES[plan]
        row = PlanPrice(plan=plan, price=price, duration_days=days)
        session.add(row)
        session.commit()
        session.refresh(row)
    return row


def list_plan_prices(session: Session) -> list[PlanPrice]:
    return [get_plan_price(session, plan) for plan in PLAN_ORDER]


def update_plan_price(session: Session, plan: str, price: int, duration_days: int) -> PlanPrice:
    """An admin sets a plan's price and length. Payments already recorded are not changed."""
    row = get_plan_price(session, plan)
    row.price = price
    row.duration_days = duration_days
    row.updated_at = utc_now()
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def _read(payment: Payment, recorded_by_name: str | None, voided_by_name: str | None) -> dict:
    return {
        "id": payment.id,
        "member_id": payment.member_id,
        "member_name": payment.member_name,
        "amount": payment.amount,
        "method": payment.method,
        "plan": payment.plan,
        "note": payment.note,
        "paid_at": payment.paid_at,
        "renewed_until": payment.renewed_until,
        "recorded_by_name": recorded_by_name,
        "voided_at": payment.voided_at,
        "void_reason": payment.void_reason,
        "voided_by_name": voided_by_name,
    }


def _with_names(filters: list):
    """Payments matching the filters, newest first, with the names of who recorded and who voided each one."""
    return (
        select(Payment, Recorder.name, Voider.name)
        # Outer joins: the payment stays listed even if those accounts are gone.
        .join(Recorder, col(Payment.recorded_by) == col(Recorder.id), isouter=True)
        .join(Voider, col(Payment.voided_by) == col(Voider.id), isouter=True)
        .where(*filters)
        .order_by(col(Payment.paid_at).desc(), col(Payment.id).desc())
    )


def _page(session: Session, filters: list, offset: int, limit: int) -> tuple[list[dict], int]:
    total = session.exec(select(func.count()).select_from(Payment).where(*filters)).one()
    rows = session.exec(_with_names(filters).offset(offset).limit(limit)).all()
    return [_read(p, recorded_by, voided_by) for p, recorded_by, voided_by in rows], total


def _start_of(day: date) -> datetime:
    """Midnight UTC at the start of a day: the same calendar the expiry check uses (SRS C-7)."""
    return datetime.combine(day, time.min, tzinfo=timezone.utc)


def _conditions(f: PaymentFilter) -> list:
    conditions = []
    if f.date_from:
        conditions.append(col(Payment.paid_at) >= _start_of(f.date_from))
    if f.date_to:
        # date_to is inclusive: everything before the start of the next day.
        conditions.append(col(Payment.paid_at) < _start_of(f.date_to + timedelta(days=1)))
    if f.method:
        conditions.append(col(Payment.method) == f.method)
    if f.member:
        # autoescape: a % or _ typed in the box matches itself, not "anything".
        conditions.append(col(Payment.member_name).icontains(f.member, autoescape=True))
    if not f.include_voided:
        conditions.append(col(Payment.voided_at).is_(None))
    return conditions


def record_payment(session: Session, member_id: int, data: PaymentCreate, recorded_by: User) -> dict:
    """Record what a member paid. With renew_plan, the membership is extended in the same step."""
    member = member_service.get_member(session, member_id)
    renewed_until = None
    if data.renew_plan:
        days = get_plan_price(session, data.renew_plan).duration_days
        # An active member renews from their current expiry, so no paid days are lost; an expired one from today.
        renewed_until = max(utc_today(), member.expires_on) + timedelta(days=days)
        member.expires_on = renewed_until
        member.plan = data.renew_plan
        session.add(member)
    payment = Payment(
        member_id=member.id,
        # Kept on the payment so the record still reads correctly after the member's account is deleted.
        member_name=member.name,
        amount=data.amount,
        method=data.method,
        plan=data.renew_plan,
        note=data.note or None,
        renewed_until=renewed_until,
        recorded_by=recorded_by.id,
    )
    session.add(payment)
    session.commit()
    session.refresh(payment)
    return _read(payment, recorded_by.name, None)


def list_member_payments(session: Session, member_id: int, offset: int, limit: int) -> tuple[list[dict], int]:
    """A member's payments for staff, voided ones included (they show as voided)."""
    member_service.get_member(session, member_id)
    return _page(session, [col(Payment.member_id) == member_id], offset, limit)


def list_own_payments(session: Session, user: User, offset: int, limit: int) -> tuple[list[dict], int]:
    """The logged-in user's own payments, voided ones included. Nobody can read someone else's here."""
    return _page(session, [col(Payment.member_id) == user.id], offset, limit)


def list_payments(session: Session, f: PaymentFilter, offset: int, limit: int) -> tuple[list[dict], int, int]:
    """One page of all payments, plus how many match and the sum of the matching payments that are not voided."""
    conditions = _conditions(f)
    items, total = _page(session, conditions, offset, limit)
    total_amount = session.exec(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(*conditions, col(Payment.voided_at).is_(None))
    ).one()
    return items, total, total_amount


def void_payment(session: Session, payment_id: int, voided_by: User, reason: str) -> dict:
    """Mark a payment as voided. Voiding twice changes nothing: the first time and reason are kept."""
    # Only a payment that is not voided yet is updated, so two admins voiding at the same moment cannot overwrite each other.
    session.exec(
        update(Payment)
        .where(col(Payment.id) == payment_id, col(Payment.voided_at).is_(None))
        .values(voided_at=utc_now(), void_reason=reason, voided_by=voided_by.id)
    )
    session.commit()
    row = session.exec(_with_names([col(Payment.id) == payment_id])).first()
    if row is None:
        raise PaymentNotFoundError(payment_id)
    payment, recorded_by, voided_by_name = row
    return _read(payment, recorded_by, voided_by_name)


def _utc_text(value: datetime | None) -> str:
    return as_utc(value).strftime("%Y-%m-%d %H:%M:%S") if value else ""


def _cell(value: object) -> object:
    """Text that a spreadsheet would treat as a formula gets a leading apostrophe, so it shows as plain text."""
    if value is None:
        return ""
    if isinstance(value, str) and value.startswith(_FORMULA_START):
        return "'" + value
    return value


def export_csv(session: Session, f: PaymentFilter) -> str:
    """Every payment matching the filters as CSV, newest first. Starts with a BOM so Excel reads it as UTF-8."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow(CSV_HEADER)
    for p, recorded_by, voided_by in session.exec(_with_names(_conditions(f))).all():
        row = [
            p.id,
            _utc_text(p.paid_at),
            p.member_name,
            p.member_id,
            p.amount,
            p.method,
            p.plan,
            p.renewed_until.isoformat() if p.renewed_until else None,
            p.note,
            recorded_by,
            _utc_text(p.voided_at),
            p.void_reason,
            voided_by,
        ]
        writer.writerow([_cell(v) for v in row])
    return "﻿" + buffer.getvalue()
