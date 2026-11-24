# Expenses under /api/v1/expenses (TDD 6.2). Every route needs expenses:manage (admins; 403 for everyone else).
# Routes only handle HTTP; the rules live in app/services/expense_service.py.
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Response

from app.database import SessionDep
from app.models import ExpenseCreate, ExpenseFilter, ExpensePage, ExpenseRead, ExpenseUpdate, User, utc_today
from app.rbac import Permission, require_permission
from app.request_info import ClientDep
from app.services import expense_service

router = APIRouter(prefix="/api/v1/expenses", tags=["expenses"])

# Recording, deleting and exporting also need to know who acts.
Manager = Annotated[User, Depends(require_permission(Permission.EXPENSES_MANAGE))]
MANAGE = Depends(require_permission(Permission.EXPENSES_MANAGE))
Filters = Annotated[ExpenseFilter, Query()]
ExpenseId = Annotated[int, Path(ge=1, le=2_147_483_647)]


@router.get("", response_model=ExpensePage, dependencies=[MANAGE])
def list_expenses(
    session: SessionDep,
    filters: Filters,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict:
    """Latest first. total_amount adds up every matching expense, not just this page."""
    items, total, total_amount = expense_service.list_expenses(session, filters, offset, limit)
    return {"items": items, "total": total, "offset": offset, "limit": limit, "total_amount": total_amount}


@router.post("", status_code=201, response_model=ExpenseRead)
def create_expense(body: ExpenseCreate, session: SessionDep, manager: Manager) -> dict:
    """The amount is in whole taka; spent_on cannot be in the future."""
    return expense_service.create_expense(session, body, manager)


@router.get(
    "/export.csv",
    response_class=Response,
    responses={200: {"content": {"text/csv": {}}, "description": "The matching expenses as CSV"}},
)
def export_expenses(session: SessionDep, filters: Filters, manager: Manager, client: ClientDep) -> Response:
    """The same filters and order as the list, every matching expense. The download is logged."""
    filename = f"expenses-{utc_today().isoformat()}.csv"
    return Response(
        content=expense_service.export_csv(session, filters, manager, client),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"},
    )


@router.patch("/{expense_id}", response_model=ExpenseRead, dependencies=[MANAGE])
def update_expense(expense_id: ExpenseId, body: ExpenseUpdate, session: SessionDep) -> dict:
    """Only the fields sent change."""
    return expense_service.update_expense(session, expense_id, body.model_dump(exclude_unset=True))


@router.delete("/{expense_id}", status_code=204)
def delete_expense(expense_id: ExpenseId, session: SessionDep, manager: Manager, client: ClientDep) -> None:
    """Written to the activity log with what was deleted."""
    expense_service.delete_expense(session, expense_id, manager, client)
