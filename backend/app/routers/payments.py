# All payments under /api/v1/payments (TDD 6.2): the list for staff; voiding and the CSV export for admins.
# Routes only handle HTTP; the rules live in app/services/payment_service.py.
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response

from app.database import SessionDep
from app.deps import require_roles
from app.models import PaymentFilter, PaymentListPage, PaymentRead, User, VoidRequest, utc_today
from app.services import payment_service

# Gym managers and admins can read the list (401 without a login, 403 for a user).
router = APIRouter(
    prefix="/api/v1/payments",
    tags=["payments"],
    dependencies=[Depends(require_roles("gym_manager", "admin"))],
)

AdminUser = Annotated[User, Depends(require_roles("admin"))]
Filters = Annotated[PaymentFilter, Query()]


@router.get("", response_model=PaymentListPage)
def list_payments(
    session: SessionDep,
    filters: Filters,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict:
    """Newest first. Voided payments are hidden unless include_voided=true, and never count towards total_amount."""
    items, total, total_amount = payment_service.list_payments(session, filters, offset, limit)
    return {"items": items, "total": total, "offset": offset, "limit": limit, "total_amount": total_amount}


@router.get(
    "/export.csv",
    response_class=Response,
    responses={200: {"content": {"text/csv": {}}, "description": "The matching payments as CSV"}},
)
def export_payments(session: SessionDep, filters: Filters, _admin: AdminUser) -> Response:
    """Admin only. The same filters as the list, every matching payment, newest first."""
    filename = f"payments-{utc_today().isoformat()}.csv"
    return Response(
        content=payment_service.export_csv(session, filters),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{payment_id}/void", response_model=PaymentRead)
def void_payment(payment_id: int, body: VoidRequest, session: SessionDep, admin: AdminUser) -> dict:
    """Admin only. The payment stays on record but is left out of totals. Voiding it again changes nothing."""
    return payment_service.void_payment(session, payment_id, admin, body.reason)
