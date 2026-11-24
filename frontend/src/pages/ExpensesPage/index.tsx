import { type FormEvent, Fragment, useEffect, useState } from "react"
import ExpenseForm from "../../components/ExpenseForm"
import { createExpense, deleteExpense, exportExpensesCsv, listExpenses, updateExpense } from "../../services/expenseService"
import type { Expense, ExpenseBody, ExpenseCategory, ExpenseFilters } from "../../types/expense"
import { EXPENSE_CATEGORIES, expenseLabel } from "../../utils/expense"
import { errorText, formatDate, todayUtc } from "../../utils/member"
import { formatMoney, saveFile } from "../../utils/payment"

const NO_FILTERS: ExpenseFilters = { date_from: "", date_to: "", category: "", q: "" }

// Admins only: what the gym spends. With the payments it gives the net income on the Dashboard.
export default function ExpensesPage() {
  // What is typed in the filter form, and the filters the list was last loaded with.
  const [draft, setDraft] = useState<ExpenseFilters>(NO_FILTERS)
  const [filters, setFilters] = useState<ExpenseFilters>(NO_FILTERS)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [total, setTotal] = useState(0)
  const [totalAmount, setTotalAmount] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState("")
  const [filterError, setFilterError] = useState("")
  const [exporting, setExporting] = useState(false)
  // The row whose edit form or delete question is open.
  const [open, setOpen] = useState<{ id: number; action: "edit" | "delete" } | null>(null)
  const [saving, setSaving] = useState(false)
  const [rowError, setRowError] = useState("")
  const [addError, setAddError] = useState("")
  const [formKey, setFormKey] = useState(0)

  useEffect(() => {
    let ignore = false
    setLoading(true)
    setError("")
    listExpenses(filters, 0)
      .then((page) => {
        if (ignore) return
        setExpenses(page.items)
        setTotal(page.total)
        setTotalAmount(page.total_amount)
      })
      .catch((err) => !ignore && setError(errorText(err)))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [filters, reloadKey])

  function apply(e: FormEvent) {
    e.preventDefault()
    if (draft.date_from && draft.date_to && draft.date_from > draft.date_to) {
      setFilterError("The From date must be on or before the To date.")
      return
    }
    setFilterError("")
    setOpen(null)
    setFilters({ ...draft, q: draft.q.trim() })
  }

  async function loadMore() {
    setLoadingMore(true)
    try {
      const page = await listExpenses(filters, expenses.length)
      setExpenses((prev) => [...prev, ...page.items])
      setTotal(page.total)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoadingMore(false)
    }
  }

  async function exportCsv() {
    setExporting(true)
    setError("")
    try {
      saveFile(await exportExpensesCsv(filters), `expenses-${todayUtc()}.csv`)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setExporting(false)
    }
  }

  /** Runs a change, then loads the list again so the rows and the total are right. */
  async function run(action: () => Promise<unknown>, showError: (message: string) => void) {
    setSaving(true)
    showError("")
    try {
      await action()
      setOpen(null)
      setReloadKey((k) => k + 1)
      return true
    } catch (err) {
      showError(errorText(err))
      return false
    } finally {
      setSaving(false)
    }
  }

  async function add(body: ExpenseBody) {
    if (await run(() => createExpense(body), setAddError)) setFormKey((k) => k + 1)
  }

  const toggle = (id: number, action: "edit" | "delete") => {
    setRowError("")
    setOpen({ id, action })
  }

  let body
  if (loading && expenses.length === 0) body = <p className="empty">Loading expenses…</p>
  else if (expenses.length === 0) body = <p className="empty">No expenses match.</p>
  else
    body = (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Amount</th>
              <th>Description</th>
              <th>Recorded by</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((x) => (
              <Fragment key={x.id}>
                <tr>
                  <td>{formatDate(x.spent_on)}</td>
                  <td>{expenseLabel(x.category)}</td>
                  <td>{formatMoney(x.amount)}</td>
                  <td className="wrap">{x.description ?? "—"}</td>
                  <td>{x.recorded_by_name ?? "—"}</td>
                  <td>
                    <div className="actions">
                      <button type="button" onClick={() => toggle(x.id, "edit")} disabled={saving}>
                        Edit
                      </button>
                      <button type="button" className="danger" onClick={() => toggle(x.id, "delete")} disabled={saving}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
                {open?.id === x.id && (
                  <tr className={open.action === "edit" ? "reset-row" : "void-row"}>
                    <td colSpan={6}>
                      {open.action === "edit" ? (
                        <ExpenseForm
                          expense={x}
                          saving={saving}
                          error={rowError}
                          onSave={(changes) => run(() => updateExpense(x.id, changes), setRowError)}
                          onCancel={() => setOpen(null)}
                        />
                      ) : (
                        <div className="stack">
                          <span>
                            Delete this expense of {formatMoney(x.amount)}? The totals change, it cannot be undone, and it is
                            recorded in the activity log.
                          </span>
                          <div className="actions">
                            <button type="button" className="danger solid" onClick={() => run(() => deleteExpense(x.id), setRowError)} disabled={saving}>
                              {saving ? "Deleting…" : "Yes, delete"}
                            </button>
                            <button type="button" onClick={() => setOpen(null)} disabled={saving}>
                              Keep it
                            </button>
                          </div>
                          {rowError && (
                            <p className="error" role="alert">
                              {rowError}
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    )

  return (
    <div className="column">
      <section className="card" aria-labelledby="add-expense-heading">
        <h2 id="add-expense-heading">Add an expense</h2>
        <ExpenseForm key={formKey} saving={saving} error={addError} onSave={add} />
      </section>
      <section className="card" aria-labelledby="expenses-heading">
        <div className="toolbar">
          <h2 id="expenses-heading">Expenses</h2>
          <button onClick={exportCsv} disabled={exporting || loading || total === 0}>
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>
        <form className="filters" onSubmit={apply} noValidate aria-label="Filter expenses">
          <div className="field">
            <label htmlFor="expense-from">From</label>
            <input id="expense-from" type="date" value={draft.date_from} onChange={(e) => setDraft({ ...draft, date_from: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="expense-to">To</label>
            <input id="expense-to" type="date" value={draft.date_to} onChange={(e) => setDraft({ ...draft, date_to: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="expense-filter-category">Category</label>
            <select
              id="expense-filter-category"
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value as ExpenseCategory | "" })}
            >
              <option value="">Any</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="expense-q">Description</label>
            <input id="expense-q" value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} maxLength={100} placeholder="Any" autoComplete="off" />
          </div>
          <div className="actions">
            <button className="primary" type="submit" disabled={loading}>
              Apply
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(NO_FILTERS)
                setFilters(NO_FILTERS)
                setFilterError("")
                setOpen(null)
              }}
              disabled={loading}
            >
              Clear
            </button>
          </div>
        </form>
        {filterError && (
          <p className="error" role="alert">
            {filterError}
          </p>
        )}
        <p className="summary" aria-live="polite">
          <strong>{formatMoney(totalAmount)}</strong> in {total} expense{total === 1 ? "" : "s"}
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {body}
        {expenses.length > 0 && (
          <div className="list-foot">
            <span>
              Showing {expenses.length} of {total}
            </span>
            {expenses.length < total && (
              <button onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
