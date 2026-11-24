import { type FormEvent, useEffect, useRef, useState } from "react"
import { usePlans } from "../context/PlansContext"
import { createMember } from "../services/memberService"
import type { Member } from "../types/member"
import type { PaymentMethod } from "../types/payment"
import { errorText, formatDate, todayUtc } from "../utils/member"
import { METHODS, addDays, formatMoney } from "../utils/payment"
import TrainerSelect from "./TrainerSelect"

const EMPTY = { email: "", phone: "", plan: "", expires_on: "", trainer_id: "", payment_method: "" as PaymentMethod | "", notes: "" }

// Members are users: the person signs up first, then staff start a membership on that account by its email.
interface Props {
  onCreated: (member: Member) => void
  /** Set by Start membership in the waiting list: the email to fill in (key changes on every click). */
  start?: { email: string; key: number } | null
}

export default function AddMemberForm({ onCreated, start }: Props) {
  const { offered } = usePlans()
  const [form, setForm] = useState(EMPTY)
  // Until one is picked, the first (cheapest) plan.
  const plan = offered.find((p) => p.plan === form.plan) ?? offered[0]
  const section = useRef<HTMLElement>(null)
  const planField = useRef<HTMLSelectElement>(null)

  // Start membership: fill the email, bring the form into view and go straight to the plan.
  useEffect(() => {
    if (!start) return
    setForm((f) => ({ ...f, email: start.email }))
    section.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    planField.current?.focus({ preventScroll: true })
  }, [start])

  const [fieldErrors, setFieldErrors] = useState<{ email?: string; plan?: string; expires_on?: string }>({})
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const today = todayUtc()
    const errors: typeof fieldErrors = {}
    const email = form.email.trim()
    if (!email) errors.email = "Enter the email the person signed up with."
    else if (!/^\S+@\S+\.\S+$/.test(email)) errors.email = "Enter a valid email address."
    if (!plan) errors.plan = "Add a plan on the Plans page first."
    if (form.expires_on && form.expires_on < today) errors.expires_on = `Expiry can't be before the joined date (${formatDate(today)}).`
    setFieldErrors(errors)
    setError("")
    if (Object.keys(errors).length || !plan) return

    setSaving(true)
    try {
      const member = await createMember({
        email,
        phone: form.phone.trim() || null,
        plan: plan.plan,
        expires_on: form.expires_on || null,
        trainer_id: form.trainer_id ? Number(form.trainer_id) : null,
        notes: form.notes.trim() || null,
        payment_method: form.payment_method || null,
      })
      setForm(EMPTY)
      onCreated(member)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card" aria-labelledby="add-heading" ref={section}>
      <h2 id="add-heading">Add member</h2>
      <form className="fields" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="add-email">Account email</label>
          <input
            id="add-email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            maxLength={254}
            placeholder="rafi@example.com"
            autoComplete="off"
          />
          {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
        </div>
        <div className="field">
          <label htmlFor="add-phone">Phone (optional)</label>
          <input
            id="add-phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            maxLength={20}
            placeholder="01700000000"
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label htmlFor="add-plan">Plan</label>
          <select id="add-plan" ref={planField} value={plan?.plan ?? ""} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
            {offered.map((p) => (
              <option key={p.plan} value={p.plan}>
                {p.name} · {formatMoney(p.price)} · {p.duration_days} days
              </option>
            ))}
          </select>
          {fieldErrors.plan && <span className="field-error">{fieldErrors.plan}</span>}
        </div>
        <div className="field">
          <label htmlFor="add-payment">First payment</label>
          <select
            id="add-payment"
            value={form.payment_method}
            onChange={(e) => setForm({ ...form, payment_method: e.target.value as PaymentMethod | "" })}
          >
            <option value="">Not paid yet</option>
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {plan ? `${formatMoney(plan.price)} by ${m.label.toLowerCase()}` : m.label}
              </option>
            ))}
          </select>
        </div>
        <TrainerSelect
          id="add-trainer"
          label="Personal trainer (optional)"
          value={form.trainer_id}
          onChange={(trainer_id) => setForm((prev) => ({ ...prev, trainer_id }))}
        />
        <div className="field">
          <label htmlFor="add-expires">Expires on (optional)</label>
          <input
            id="add-expires"
            type="date"
            value={form.expires_on}
            min={todayUtc()}
            onChange={(e) => setForm({ ...form, expires_on: e.target.value })}
          />
          {!form.expires_on && plan && (
            <span className="hint">Left empty: {formatDate(addDays(todayUtc(), plan.duration_days))}, the plan's length.</span>
          )}
          {fieldErrors.expires_on && <span className="field-error">{fieldErrors.expires_on}</span>}
        </div>
        <div className="field wide">
          <label htmlFor="add-notes">Notes (optional)</label>
          <textarea
            id="add-notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            maxLength={500}
            placeholder="Prefers morning sessions"
          />
        </div>
        <div className="field wide actions">
          <button className="primary" type="submit" disabled={saving}>
            {saving ? "Adding…" : "Add member"}
          </button>
          <span className="hint">The person signs up first; their name comes from their account. Joined date is set to today.</span>
        </div>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  )
}
