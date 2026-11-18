# Taking payments at the front desk, and renewing a membership with them (SRS FR-43 to FR-46).
from datetime import timedelta

from sqlmodel import Session, col, func, select

from app.models import DEFAULT_PLAN_PRICES, Payment, PaymentCreate, PlanPrice, User, utc_now, utc_today
from app.services import member_service

PLAN_ORDER = ["monthly", "quarterly", "yearly"]


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


def _read(payment: Payment, recorded_by_name: str | None) -> dict:
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
    }


def _page(session: Session, filters: list, offset: int, limit: int) -> tuple[list[dict], int]:
    """Payments matching the filters, newest first, with the name of whoever recorded each one."""
    total = session.exec(select(func.count()).select_from(Payment).where(*filters)).one()
    query = (
        select(Payment, User.name)
        # Outer join: the payment stays listed even if the account that recorded it is gone.
        .join(User, col(Payment.recorded_by) == col(User.id), isouter=True)
        .where(*filters)
        .order_by(col(Payment.paid_at).desc(), col(Payment.id).desc())
        .offset(offset)
        .limit(limit)
    )
    return [_read(p, name) for p, name in session.exec(query).all()], total


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
        member.updated_at = utc_now()
        session.add(member)
    payment = Payment(
        member_id=member.id,
        # Kept on the payment so the record still reads correctly after the member is deleted.
        member_name=member.full_name,
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
    return _read(payment, recorded_by.name)


def list_member_payments(session: Session, member_id: int, offset: int, limit: int) -> tuple[list[dict], int]:
    member_service.get_member(session, member_id)
    return _page(session, [col(Payment.member_id) == member_id], offset, limit)
