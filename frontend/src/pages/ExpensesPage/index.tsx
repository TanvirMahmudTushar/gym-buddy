import { useState } from "react"
import Alert from "../../components/Alert"
import ConfirmModal from "../../components/ConfirmModal"
import ExpenseForm from "../../components/ExpenseForm"
import ExportButton from "../../components/ExportButton"
import Icon from "../../components/Icon"
import ListState from "../../components/ListState"
import Modal from "../../components/Modal"
import PageHeader from "../../components/PageHeader"
import Pager from "../../components/Pager"
import { useDebouncedValue } from "../../hooks/useDebouncedValue"
import { usePagedList } from "../../hooks/usePagedList"
import { useSave } from "../../hooks/useSave"
import { createExpense, deleteExpense, exportExpensesCsv, listExpenses, updateExpense } from "../../services/expenseService"
import type { Expense, ExpenseBody, ExpenseCategory, ExpenseFilters } from "../../types/expense"
import { EXPENSE_CATEGORIES, expenseLabel } from "../../utils/expense"
import { formatMoney } from "../../utils/payment"
import { count } from "../../utils/text"
import { formatDate } from "../../utils/time"

const NO_FILTERS: ExpenseFilters = { date_from: "", date_to: "", category: "", q: "" }

// Admins only: what the gym spends. With the payments it gives the net income on the Dashboard.
export default function ExpensesPage() {
  // What the filter boxes show, and (once the typing pauses) what the list is loaded with.
  const [draft, setDraft] = useState<ExpenseFilters>(NO_FILTERS)
  const filters = useDebouncedValue(draft)
  const [reloadKey, setReloadKey] = useState(0)
  const list = usePagedList(listExpenses, filters, reloadKey)
  const [exportError, setExportError] = useState("")
  // The open dialog: adding, editing or deleting an expense.
  const [dialog, setDialog] = useState<"add" | { edit: Expense } | { remove: Expense } | null>(null)
  const { saving, error, setError, run } = useSave()

  function close() {
    setDialog(null)
    setError("")
  }

  function done() {
    close()
    setReloadKey((k) => k + 1)
  }

  const save = (body: ExpenseBody, expense?: Expense) =>
    run(async () => {
      await (expense ? updateExpense(expense.id, body) : createExpense(body))
      done()
    })

  return (
    <div className="page">
      <PageHeader title="Expenses" subtitle="What the gym spends. Payments minus expenses is the net income on the Dashboard.">
        <ExportButton name="expenses" load={() => exportExpensesCsv(filters)} disabled={list.total === 0} onError={setExportError} />
        <button type="button" className="primary" onClick={() => setDialog("add")}>
          <Icon name="plus" /> Add expense
        </button>
      </PageHeader>
      <section className="card">
        <div className="filters">
          <div className="field">
            <label htmlFor="filter-from">From</label>
            <input id="filter-from" type="date" max={draft.date_to || undefined} value={draft.date_from} onChange={(e) => setDraft({ ...draft, date_from: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="filter-to">To</label>
            <input id="filter-to" type="date" min={draft.date_from || undefined} value={draft.date_to} onChange={(e) => setDraft({ ...draft, date_to: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="filter-category">Category</label>
            <select id="filter-category" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as ExpenseCategory | "" })}>
              <option value="">Any</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field grow">
            <label htmlFor="filter-q">Description</label>
            <input id="filter-q" type="search" value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} maxLength={100} placeholder="Any" autoComplete="off" />
          </div>
          <button type="button" onClick={() => setDraft(NO_FILTERS)}>
            Clear
          </button>
        </div>
        <p className="summary">
          <strong>{formatMoney(list.data?.total_amount ?? 0)}</strong> in {count(list.total, "expense")}
        </p>
        <Alert>{exportError}</Alert>
        <ListState loading={list.loading} error={list.error} isEmpty={list.items.length === 0} empty="No expenses match these filters.">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Date</th>
                  <th className="number">Amount</th>
                  <th>Description</th>
                  <th>Recorded by</th>
                  <th className="act">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((x) => (
                  <tr key={x.id}>
                    <td className="name">{expenseLabel(x.category)}</td>
                    <td data-label="Date" className="nowrap">
                      {formatDate(x.spent_on)}
                    </td>
                    <td data-label="Amount" className="number">
                      {formatMoney(x.amount)}
                    </td>
                    <td data-label="Description">{x.description ?? "—"}</td>
                    <td data-label="Recorded by">{x.recorded_by_name ?? "—"}</td>
                    <td className="act">
                      <div className="actions">
                        <button type="button" className="small" onClick={() => setDialog({ edit: x })}>
                          Edit
                        </button>
                        <button type="button" className="small danger" onClick={() => setDialog({ remove: x })}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager {...list} onChange={list.goTo} />
        </ListState>
      </section>
      {dialog === "add" && (
        <Modal title="Add an expense" onClose={close}>
          <ExpenseForm saving={saving} error={error} onSave={(body) => save(body)} onCancel={close} />
        </Modal>
      )}
      {dialog !== null && typeof dialog === "object" && "edit" in dialog && (
        <Modal title="Edit expense" onClose={close}>
          <ExpenseForm expense={dialog.edit} saving={saving} error={error} onSave={(body) => save(body, dialog.edit)} onCancel={close} />
        </Modal>
      )}
      {dialog !== null && typeof dialog === "object" && "remove" in dialog && (
        <ConfirmModal
          title="Delete this expense?"
          confirmLabel="Delete expense"
          busyLabel="Deleting…"
          onClose={close}
          onConfirm={async () => {
            await deleteExpense(dialog.remove.id)
            done()
          }}
        >
          {expenseLabel(dialog.remove.category)}, {formatMoney(dialog.remove.amount)} on {formatDate(dialog.remove.spent_on)}. The totals change and
          it cannot be undone. It is recorded in the activity log.
        </ConfirmModal>
      )}
    </div>
  )
}
