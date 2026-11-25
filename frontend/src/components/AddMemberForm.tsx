import { type FormEvent, useState } from "react"
import { usePlans } from "../context/PlansContext"
import { useSave } from "../hooks/useSave"
import { createMember } from "../services/memberService"
import type { Member } from "../types/member"
import type { PaymentMethod } from "../types/payment"
import { METHODS, formatMoney } from "../utils/payment"
import { addDays, formatDate, gymToday } from "../utils/time"
import FieldError from "./FieldError"
import FormActions from "./FormActions"
import TrainerSelect from "./TrainerSelect"

interface Props {
  /** Filled in when it was started from the waiting list. */
  email?: string
  onCreated: (member: Member) => void
  onCancel: () => void
}

// Members are users: the person signs up first, then staff start a membership on that account by its email.
export default function AddMemberForm({ email: startEmail = "", onCreated, onCancel }: Props) {
  const { offered } = usePlans()
  const [form, setForm] = useState({
    email: startEmail,
    phone: "",
    plan: "",
    expires_on: "",
    trainer_id: "",
    payment_method: "" as PaymentMethod | "",
    notes: "",
  })
  const [errors, setErrors] = useState<{ email?: string; plan?: string; expires_on?: string }>({})
  const { saving, error, run } = useSave()
  // Until one is picked, the first (cheapest) plan.
  const plan = offered.find((p) => p.plan === form.plan) ?? offered[0]
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((prev) => ({ ...prev, [key]: e.target.value }))

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const today = gymToday()
    const next: typeof errors = {}
    const email = form.email.trim()
    if (!email) next.email = "Enter the email the person signed up with."
    else if (!/^\S+@\S+\.\S+$/.test(email)) next.email = "Enter a valid email address."
    if (!plan) next.plan = "Add a plan on the Plans page first."
    if (form.expires_on && form.expires_on < today) next.expires_on = "Pick today or a later day."
    setErrors(next)
    if (Object.keys(next).length || !plan) return
    void run(async () =>
      onCreated(
        await createMember({
          email,
          phone: form.phone.trim() || null,
          plan: plan.plan,
          expires_on: form.expires_on || null,
          trainer_id: form.trainer_id ? Number(form.trainer_id) : null,
          notes: form.notes.trim() || null,
          payment_method: form.payment_method || null,
        }),
      ),
    )
  }

  return (
    <form className="fields" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor="add-email">Account email</label>
        <input id="add-email" type="email" value={form.email} onChange={set("email")} maxLength={254} placeholder="rafi@example.com" autoComplete="off" autoFocus />
        <FieldError>{errors.email}</FieldError>
      </div>
      <div className="field">
        <label htmlFor="add-phone">Phone (optional)</label>
        <input id="add-phone" type="tel" value={form.phone} onChange={set("phone")} maxLength={20} placeholder="01700000000" autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor="add-plan">Plan</label>
        <select id="add-plan" value={plan?.plan ?? ""} onChange={set("plan")}>
          {offered.map((p) => (
            <option key={p.plan} value={p.plan}>
              {p.name} · {formatMoney(p.price)}
            </option>
          ))}
        </select>
        <FieldError>{errors.plan}</FieldError>
      </div>
      <div className="field">
        <label htmlFor="add-payment">First payment</label>
        <select id="add-payment" value={form.payment_method} onChange={set("payment_method")}>
          <option value="">Not paid yet</option>
          {METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {plan ? `${formatMoney(plan.price)} by ${m.label.toLowerCase()}` : m.label}
            </option>
          ))}
        </select>
      </div>
      <TrainerSelect id="add-trainer" value={form.trainer_id} onChange={(trainer_id) => setForm((prev) => ({ ...prev, trainer_id }))} />
      <div className="field">
        <label htmlFor="add-expires">Expires on (optional)</label>
        <input id="add-expires" type="date" value={form.expires_on} min={gymToday()} onChange={set("expires_on")} />
        <FieldError>{errors.expires_on}</FieldError>
        {!form.expires_on && plan && <span className="hint">Empty: {formatDate(addDays(gymToday(), plan.duration_days))}</span>}
      </div>
      <div className="field wide">
        <label htmlFor="add-notes">Notes (optional)</label>
        <textarea id="add-notes" value={form.notes} onChange={set("notes")} maxLength={500} placeholder="Prefers morning sessions" />
      </div>
      <FormActions label="Start membership" saving={saving} error={error} onCancel={onCancel} />
    </form>
  )
}
