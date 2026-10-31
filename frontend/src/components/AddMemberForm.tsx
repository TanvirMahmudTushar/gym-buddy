import { type FormEvent, useState } from "react"
import { createMember } from "../api"
import { type Member, type Plan, PLANS, errorText, formatDate, todayUtc } from "../members"

const EMPTY = { full_name: "", phone: "", plan: "monthly" as Plan, expires_on: "", notes: "" }

export default function AddMemberForm({ onCreated }: { onCreated: (member: Member) => void }) {
  const [form, setForm] = useState(EMPTY)
  const [fieldErrors, setFieldErrors] = useState<{ full_name?: string; expires_on?: string }>({})
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const today = todayUtc()
    const errors: typeof fieldErrors = {}
    if (!form.full_name.trim()) errors.full_name = "Enter the member's name."
    if (!form.expires_on) errors.expires_on = "Pick an expiry date."
    else if (form.expires_on < today) errors.expires_on = `Expiry can't be before the joined date (${formatDate(today)}).`
    setFieldErrors(errors)
    setError("")
    if (Object.keys(errors).length) return

    setSaving(true)
    try {
      const member = await createMember({
        full_name: form.full_name.trim(),
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
    <section className="card" aria-labelledby="add-heading">
      <h2 id="add-heading">Add member</h2>
      <form className="fields" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="add-name">Full name</label>
          <input
            id="add-name"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            maxLength={100}
            placeholder="Rafi Ahmed"
            autoComplete="off"
          />
          {fieldErrors.full_name && <span className="field-error">{fieldErrors.full_name}</span>}
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
          <select id="add-plan" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value as Plan })}>
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
          <span className="hint">Joined date is set to today.</span>
        </div>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  )
}
