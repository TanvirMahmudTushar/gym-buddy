import { type FormEvent, useState } from "react"
import type { Expense, ExpenseBody, ExpenseCategory } from "../types/expense"
import { EXPENSE_CATEGORIES } from "../utils/expense"
import { gymToday } from "../utils/time"
import FieldError from "./FieldError"
import FormActions from "./FormActions"

interface Props {
  /** The expense being edited; leave out to add a new one. */
  expense?: Expense
  saving: boolean
  error: string
  onSave: (body: ExpenseBody) => void
  onCancel: () => void
}

type Errors = Partial<Record<"amount" | "spent_on", string>>

// One form for adding and editing an expense, with the same checks the API makes.
export default function ExpenseForm({ expense, saving, error, onSave, onCancel }: Props) {
  const today = gymToday()
  const [form, setForm] = useState({
    category: expense?.category ?? ("rent" as ExpenseCategory),
    amount: expense ? String(expense.amount) : "",
    spent_on: expense?.spent_on ?? today,
    description: expense?.description ?? "",
  })
  const [errors, setErrors] = useState<Errors>({})
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
    <form className="fields" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor="expense-category">Category</label>
        <select id="expense-category" value={form.category} onChange={set("category")}>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="expense-amount">Amount (taka)</label>
        <input id="expense-amount" type="number" min={1} step={1} inputMode="numeric" value={form.amount} onChange={set("amount")} autoFocus />
        <FieldError>{errors.amount}</FieldError>
      </div>
      <div className="field">
        <label htmlFor="expense-date">Date</label>
        <input id="expense-date" type="date" max={today} value={form.spent_on} onChange={set("spent_on")} />
        <FieldError>{errors.spent_on}</FieldError>
      </div>
      <div className="field wide">
        <label htmlFor="expense-description">Description (optional)</label>
        <input id="expense-description" value={form.description} onChange={set("description")} maxLength={200} autoComplete="off" />
      </div>
      <FormActions label={expense ? "Save changes" : "Add expense"} saving={saving} error={error} onCancel={onCancel} />
    </form>
  )
}
