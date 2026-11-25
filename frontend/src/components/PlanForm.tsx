import { type FormEvent, useState } from "react"
import type { MembershipPlan, PlanBody } from "../types/payment"
import FieldError from "./FieldError"
import FormActions from "./FormActions"

interface Props {
  /** The plan being edited; leave out to add a new one. */
  plan?: MembershipPlan
  saving: boolean
  error: string
  onSave: (body: PlanBody) => void
  onCancel: () => void
}

type Errors = Partial<Record<"name" | "price" | "days", string>>

// One form for adding and editing a membership plan, with the same checks the API makes.
export default function PlanForm({ plan, saving, error, onSave, onCancel }: Props) {
  const [form, setForm] = useState({
    name: plan?.name ?? "",
    price: plan ? String(plan.price) : "",
    days: plan ? String(plan.duration_days) : "",
    description: plan?.description ?? "",
  })
  const [errors, setErrors] = useState<Errors>({})
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((prev) => ({ ...prev, [key]: e.target.value }))

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const price = Number(form.price)
    const days = Number(form.days)
    const next: Errors = {}
    if (!form.name.trim()) next.name = "Enter a name."
    if (!Number.isInteger(price) || price < 1 || price > 10_000_000) next.price = "A whole number from 1 to 10,000,000."
    if (!Number.isInteger(days) || days < 1 || days > 3660) next.days = "A whole number of days from 1 to 3,660."
    setErrors(next)
    if (Object.keys(next).length) return
    onSave({ name: form.name.trim(), price, duration_days: days, description: form.description.trim() || null })
  }

  return (
    <form className="fields" onSubmit={handleSubmit} noValidate>
      <div className="field wide">
        <label htmlFor="plan-name">Name</label>
        <input id="plan-name" value={form.name} onChange={set("name")} maxLength={60} placeholder="Student monthly" autoComplete="off" autoFocus />
        <FieldError>{errors.name}</FieldError>
      </div>
      <div className="field">
        <label htmlFor="plan-price">Price (taka)</label>
        <input id="plan-price" type="number" min={1} step={1} inputMode="numeric" value={form.price} onChange={set("price")} />
        <FieldError>{errors.price}</FieldError>
      </div>
      <div className="field">
        <label htmlFor="plan-days">Length in days</label>
        <input id="plan-days" type="number" min={1} step={1} inputMode="numeric" value={form.days} onChange={set("days")} />
        <FieldError>{errors.days}</FieldError>
      </div>
      <div className="field wide">
        <label htmlFor="plan-description">What it includes (optional)</label>
        <input id="plan-description" value={form.description} onChange={set("description")} maxLength={300} autoComplete="off" />
      </div>
      <FormActions label={plan ? "Save changes" : "Add plan"} saving={saving} error={error} onCancel={onCancel} />
    </form>
  )
}
