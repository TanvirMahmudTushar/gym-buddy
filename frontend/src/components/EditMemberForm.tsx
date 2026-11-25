import { type FormEvent, useState } from "react"
import { usePlans } from "../context/PlansContext"
import type { Member, MemberUpdate } from "../types/member"
import { type ProfileErrors, type ProfileForm, checkProfile, toProfileBody, toProfileForm } from "../utils/profile"
import { formatDate } from "../utils/time"
import FieldError from "./FieldError"
import FormActions from "./FormActions"
import ProfileFields from "./ProfileFields"
import TrainerSelect from "./TrainerSelect"

interface Props {
  member: Member
  saving: boolean
  error: string
  onSave: (changes: MemberUpdate) => void
  onCancel: () => void
}

export default function EditMemberForm({ member, saving, error, onSave, onCancel }: Props) {
  const { offered, planLabel } = usePlans()
  const [form, setForm] = useState({
    name: member.name,
    plan: member.plan,
    expires_on: member.expires_on,
    trainer_id: member.trainer_id === null ? "" : String(member.trainer_id),
    notes: member.notes ?? "",
  })
  // Phone, date of birth and emergency contact: the same fields and checks as the member's own My account.
  const [profile, setProfile] = useState<ProfileForm>(() => toProfileForm(member))
  const [errors, setErrors] = useState<{ name?: string; expires_on?: string }>({})
  const [profileErrors, setProfileErrors] = useState<ProfileErrors>({})
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((prev) => ({ ...prev, [key]: e.target.value }))

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const next: typeof errors = {}
    if (!form.name.trim()) next.name = "Enter the member's name."
    if (!form.expires_on || form.expires_on < member.joined_on) next.expires_on = `Pick ${formatDate(member.joined_on)} or a later day.`
    const nextProfile = checkProfile(profile)
    setErrors(next)
    setProfileErrors(nextProfile)
    if (Object.keys(next).length || Object.keys(nextProfile).length) return
    onSave({
      name: form.name.trim(),
      plan: form.plan,
      expires_on: form.expires_on,
      trainer_id: form.trainer_id ? Number(form.trainer_id) : null,
      notes: form.notes.trim() || null,
      ...toProfileBody(profile),
    })
  }

  return (
    <form className="fields" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor="edit-name">Full name</label>
        <input id="edit-name" value={form.name} onChange={set("name")} maxLength={100} autoComplete="off" />
        <FieldError>{errors.name}</FieldError>
      </div>
      <TrainerSelect
        id="edit-trainer"
        value={form.trainer_id}
        currentName={member.trainer_name}
        onChange={(trainer_id) => setForm((prev) => ({ ...prev, trainer_id }))}
      />
      <div className="field">
        <label htmlFor="edit-plan">Plan</label>
        <select id="edit-plan" value={form.plan} onChange={set("plan")}>
          {/* A member keeps a plan that was retired since. */}
          {!offered.some((p) => p.plan === member.plan) && <option value={member.plan}>{planLabel(member.plan)}</option>}
          {offered.map((p) => (
            <option key={p.plan} value={p.plan}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="edit-expires">Expires on</label>
        <input id="edit-expires" type="date" min={member.joined_on} value={form.expires_on} onChange={set("expires_on")} />
        <FieldError>{errors.expires_on}</FieldError>
      </div>
      <ProfileFields
        idPrefix="edit"
        form={profile}
        errors={profileErrors}
        onChange={(key, value) => setProfile((prev) => ({ ...prev, [key]: value }))}
      />
      <div className="field wide">
        <label htmlFor="edit-notes">Notes</label>
        <textarea id="edit-notes" value={form.notes} onChange={set("notes")} maxLength={500} />
      </div>
      <FormActions label="Save changes" saving={saving} error={error} onCancel={onCancel} />
    </form>
  )
}
