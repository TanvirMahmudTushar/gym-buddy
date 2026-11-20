import { type FormEvent, useEffect, useRef, useState } from "react"
import { createMember } from "../services/memberService"
import type { Member, Plan } from "../types/member"
import { PLANS, errorText, formatDate, todayUtc } from "../utils/member"

const EMPTY = { email: "", phone: "", plan: "monthly" as Plan, expires_on: "", notes: "" }

// Members are users: the person signs up first, then staff start a membership on that account by its email.
interface Props {
  onCreated: (member: Member) => void
  /** Set by Start membership in the waiting list: the email to fill in (key changes on every click). */
  start?: { email: string; key: number } | null
}

export default function AddMemberForm({ onCreated, start }: Props) {
  const [form, setForm] = useState(EMPTY)
  const section = useRef<HTMLElement>(null)
  const planField = useRef<HTMLSelectElement>(null)

  // Start membership: fill the email, bring the form into view and go straight to the plan.
  useEffect(() => {
    if (!start) return
    setForm((f) => ({ ...f, email: start.email }))
    section.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    planField.current?.focus({ preventScroll: true })
  }, [start])

  const [fieldErrors, setFieldErrors] = useState<{ email?: string; expires_on?: string }>({})
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const today = todayUtc()
    const errors: typeof fieldErrors = {}
    const email = form.email.trim()
    if (!email) errors.email = "Enter the email the person signed up with."
    else if (!/^\S+@\S+\.\S+$/.test(email)) errors.email = "Enter a valid email address."
    if (!form.expires_on) errors.expires_on = "Pick an expiry date."
    else if (form.expires_on < today) errors.expires_on = `Expiry can't be before the joined date (${formatDate(today)}).`
    setFieldErrors(errors)
    setError("")
    if (Object.keys(errors).length) return

    setSaving(true)
    try {
      const member = await createMember({
        email,
        phone: form.phone.trim() || null,
        plan: form.plan,
        expires_on: form.expires_on,
        notes: form.notes.trim() || null,
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
          <select id="add-plan" ref={planField} value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value as Plan })}>
            {PLANS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="add-expires">Expires on</label>
          <input
            id="add-expires"
            type="date"
            value={form.expires_on}
            min={todayUtc()}
            onChange={(e) => setForm({ ...form, expires_on: e.target.value })}
          />
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
