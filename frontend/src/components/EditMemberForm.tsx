import { type FormEvent, useState } from "react"
import { type Member, type MemberUpdate, type Plan, PLANS } from "../members"

interface Props {
  member: Member
  saving: boolean
  onSave: (changes: MemberUpdate) => void
  onCancel: () => void
}

export default function EditMemberForm({ member, saving, onSave, onCancel }: Props) {
  const [form, setForm] = useState({
    full_name: member.full_name,
    phone: member.phone ?? "",
    plan: member.plan,
    notes: member.notes ?? "",
  })
  const [nameError, setNameError] = useState("")

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.full_name.trim()) {
      setNameError("Enter the member's name.")
      return
    }
    setNameError("")
    onSave({
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      plan: form.plan,
      notes: form.notes.trim() || null,
    })
  }

  return (
    <form className="fields" onSubmit={handleSubmit} noValidate>
      <div className="field wide">
        <label htmlFor="edit-name">Full name</label>
        <input
          id="edit-name"
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          maxLength={100}
          autoComplete="off"
        />
        {nameError && <span className="field-error">{nameError}</span>}
      </div>
      <div className="field">
        <label htmlFor="edit-phone">Phone</label>
        <input
          id="edit-phone"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          maxLength={20}
          autoComplete="off"
        />
      </div>
      <div className="field">
        <label htmlFor="edit-plan">Plan</label>
        <select id="edit-plan" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value as Plan })}>
          {PLANS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field wide">
        <label htmlFor="edit-notes">Notes</label>
        <textarea
          id="edit-notes"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          maxLength={500}
        />
      </div>
      <div className="field wide actions">
        <button className="primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  )
}
