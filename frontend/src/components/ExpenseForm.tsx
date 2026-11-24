import { type FormEvent, useState } from "react"
import type { Expense, ExpenseBody, ExpenseCategory } from "../types/expense"
import { EXPENSE_CATEGORIES } from "../utils/expense"
import { todayUtc } from "../utils/member"

interface Props {
  /** The expense being edited; leave out to add a new one. */
  expense?: Expense
  saving: boolean
  error: string
  onSave: (body: ExpenseBody) => void
  onCancel?: () => void
}

type Errors = Partial<Record<"amount" | "spent_on", string>>

// One form for adding and editing an expense, with the same checks the API makes.
export default function ExpenseForm({ expense, saving, error, onSave, onCancel }: Props) {
  const today = todayUtc()
  const [form, setForm] = useState({
    category: expense?.category ?? ("rent" as ExpenseCategory),
    amount: expense ? String(expense.amount) : "",
    spent_on: expense?.spent_on ?? today,
    description: expense?.description ?? "",
  })
  const [errors, setErrors] = useState<Errors>({})
  const id = expense ? `expense-${expense.id}` : "add-expense"
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((prev) => ({ ...prev, [key]: e.target.value }))

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const amount = Number(form.amount)
    const next: Errors = {}
    if (!Number.isInteger(amount) || amount < 1 || amount > 10_000_000) next.amount = "A whole number from 1 to 10,000,000."
    if (!form.spent_on || form.spent_on > today) next.spent_on = "Pick a date up to today."
    setErrors(next)
    if (Object.keys(next).length) return
    onSave({ category: form.category, amount, spent_on: form.spent_on, description: form.description.trim() || null })
  }

  return (
    <form className="filters" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor={`${id}-category`}>Category</label>
        <select id={`${id}-category`} value={form.category} onChange={set("category")}>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${id}-amount`}>Amount (৳)</label>
        <input id={`${id}-amount`} type="number" min={1} step={1} inputMode="numeric" value={form.amount} onChange={set("amount")} />
        {errors.amount && <span className="field-error">{errors.amount}</span>}
      </div>
      <div className="field">
        <label htmlFor={`${id}-date`}>Date</label>
        <input id={`${id}-date`} type="date" max={today} value={form.spent_on} onChange={set("spent_on")} />
        {errors.spent_on && <span className="field-error">{errors.spent_on}</span>}
      </div>
      <div className="field">
        <label htmlFor={`${id}-description`}>Description (optional)</label>
        <input id={`${id}-description`} value={form.description} onChange={set("description")} maxLength={200} autoComplete="off" />
      </div>
      <div className="actions">
        <button className="primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : expense ? "Save" : "Add expense"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
      </div>
      {error && (
        <p className="error wide-error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
