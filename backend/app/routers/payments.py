# All payments under /api/v1/payments (TDD 6.2): the list for staff; voiding and the CSV export for admins.
# Routes only handle HTTP; the rules live in app/services/payment_service.py.
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response

from app.database import SessionDep
from app.models import PaymentFilter, PaymentListPage, PaymentRead, User, VoidRequest, utc_today
from app.rbac import Permission, require_permission
from app.request_info import ClientDep
from app.services import payment_service

router = APIRouter(prefix="/api/v1/payments", tags=["payments"])

# payments:manage (gym managers and admins) reads the list; voiding and exporting have their own permissions (admins).
MANAGE_PAYMENTS = Depends(require_permission(Permission.PAYMENTS_MANAGE))
Voider = Annotated[User, Depends(require_permission(Permission.PAYMENTS_VOID))]
# The export is written to the activity log with who downloaded it.
Exporter = Annotated[User, Depends(require_permission(Permission.PAYMENTS_EXPORT))]
Filters = Annotated[PaymentFilter, Query()]


@router.get("", response_model=PaymentListPage, dependencies=[MANAGE_PAYMENTS])
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
def export_payments(session: SessionDep, filters: Filters, exporter: Exporter, client: ClientDep) -> Response:
    """Needs payments:export (admins). The same filters as the list, every matching payment, newest first.
    The download is written to the activity log."""
    filename = f"payments-{utc_today().isoformat()}.csv"
    return Response(
        content=payment_service.export_csv(session, filters, exporter, client),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{payment_id}/void", response_model=PaymentRead)
def void_payment(payment_id: int, body: VoidRequest, session: SessionDep, voider: Voider) -> dict:
    """Needs payments:void (admins). The payment stays on record but is left out of totals. Voiding it again
    changes nothing."""
    return payment_service.void_payment(session, payment_id, voider, body.reason)
