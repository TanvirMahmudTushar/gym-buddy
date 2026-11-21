import { type FormEvent, useState } from "react"
import type { Member, MemberUpdate, Plan } from "../types/member"
import { PLANS } from "../utils/member"
import { type ProfileErrors, type ProfileForm, checkProfile, toProfileBody, toProfileForm } from "../utils/profile"
import ProfileFields from "./ProfileFields"

interface Props {
  member: Member
  saving: boolean
  onSave: (changes: MemberUpdate) => void
  onCancel: () => void
}

export default function EditMemberForm({ member, saving, onSave, onCancel }: Props) {
  const [form, setForm] = useState({
    name: member.name,
    plan: member.plan,
    notes: member.notes ?? "",
  })
  // Phone, date of birth and emergency contact: the same fields and checks as the member's own My account.
  const [profile, setProfile] = useState<ProfileForm>(() => toProfileForm(member))
  const [nameError, setNameError] = useState("")
  const [profileErrors, setProfileErrors] = useState<ProfileErrors>({})

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const nextNameError = form.name.trim() ? "" : "Enter the member's name."
    const nextProfileErrors = checkProfile(profile)
    setNameError(nextNameError)
    setProfileErrors(nextProfileErrors)
    if (nextNameError || Object.keys(nextProfileErrors).length) return
    onSave({
      name: form.name.trim(),
      plan: form.plan,
      notes: form.notes.trim() || null,
      ...toProfileBody(profile),
    })
  }

  return (
    <form className="fields" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor="edit-name">Full name</label>
        <input
          id="edit-name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          maxLength={100}
          autoComplete="off"
        />
        {nameError && <span className="field-error">{nameError}</span>}
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
      <ProfileFields
        idPrefix="edit"
        form={profile}
        errors={profileErrors}
        onChange={(key, value) => setProfile((prev) => ({ ...prev, [key]: value }))}
      />
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
