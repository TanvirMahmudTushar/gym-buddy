# Expenses: what the gym spends. Admins record them; with the payments they give the month's net income.
from datetime import date

from sqlalchemy.orm import aliased
from sqlmodel import Session, col, func, select

from app.models import ActivityEvent, Expense, ExpenseCreate, ExpenseFilter, User
from app.request_info import Client
from app.services import activity_service
from app.services.csv_export import describe_filters, to_csv
from app.services.search import contains_any

Recorder = aliased(User)

CSV_HEADER = ["id", "spent_on", "category", "amount_taka", "description", "recorded_by"]


class ExpenseNotFoundError(Exception):
    """No expense has the given ID."""


def _read(expense: Expense, recorded_by_name: str | None) -> dict:
    return {**expense.model_dump(), "recorded_by_name": recorded_by_name}


def _with_recorder(conditions: list):
    """Matching expenses, latest first, with who recorded each one (outer join: that account may be gone)."""
    return (
        select(Expense, Recorder.name)
        .join(Recorder, col(Expense.recorded_by) == col(Recorder.id), isouter=True)
        .where(*conditions)
        .order_by(col(Expense.spent_on).desc(), col(Expense.id).desc())
    )


def _conditions(f: ExpenseFilter) -> list:
    conditions = []
    if f.date_from:
        conditions.append(col(Expense.spent_on) >= f.date_from)
    if f.date_to:
        conditions.append(col(Expense.spent_on) <= f.date_to)
    if f.category:
        conditions.append(col(Expense.category) == f.category)
    if f.q:
        conditions.append(contains_any(f.q, Expense.description))
    return conditions


def _get(session: Session, expense_id: int) -> Expense:
    expense = session.get(Expense, expense_id)
    if expense is None:
        raise ExpenseNotFoundError(expense_id)
    return expense


def _save(session: Session, expense: Expense) -> dict:
    session.add(expense)
    session.commit()
    session.refresh(expense)
    return _read(*session.exec(_with_recorder([col(Expense.id) == expense.id])).one())


def list_expenses(session: Session, f: ExpenseFilter, offset: int, limit: int) -> tuple[list[dict], int, int]:
    """One page, plus how many match and what they add up to."""
    conditions = _conditions(f)
    total, amount = session.exec(
        select(func.count(), func.coalesce(func.sum(Expense.amount), 0)).where(*conditions)
    ).one()
    rows = session.exec(_with_recorder(conditions).offset(offset).limit(limit)).all()
    return [_read(*row) for row in rows], total, amount


def create_expense(session: Session, data: ExpenseCreate, recorded_by: User) -> dict:
    return _save(session, Expense(**data.model_dump(), recorded_by=recorded_by.id))


def update_expense(session: Session, expense_id: int, changes: dict) -> dict:
    expense = _get(session, expense_id)
    expense.sqlmodel_update(changes)
    return _save(session, expense)


def delete_expense(session: Session, expense_id: int, admin: User, client: Client) -> None:
    """Final, so it is written to the activity log with what was deleted."""
    expense = _get(session, expense_id)
    what = f"{expense.category}, {expense.amount} taka, {expense.spent_on.isoformat()}"
    activity_service.record(
        session,
        ActivityEvent.EXPENSE_DELETE,
        client,
        actor=admin,
        details=f"{what}: {expense.description}" if expense.description else what,
    )
    session.delete(expense)
    session.commit()


def export_csv(session: Session, f: ExpenseFilter, admin: User, client: Client) -> str:
    """Every matching expense, in the list's order. The download is written to the activity log."""
    rows = session.exec(_with_recorder(_conditions(f))).all()
    text = to_csv(
        CSV_HEADER,
        ([e.id, e.spent_on.isoformat(), e.category, e.amount, e.description, name] for e, name in rows),
    )
    filters = describe_filters(f.model_dump(exclude_none=True))
    activity_service.record(
        session, ActivityEvent.EXPORT, client, actor=admin, details=f"expenses.csv: {len(rows)} rows; {filters}"
    )
    session.commit()
    return text


def total_between(session: Session, start: date, end: date) -> int:
    """The expenses dated from `start` up to (not including) `end`."""
    return session.exec(
        select(func.coalesce(func.sum(Expense.amount), 0)).where(
            col(Expense.spent_on) >= start, col(Expense.spent_on) < end
        )
    ).one()
