import { type FormEvent, useState } from "react"
import type { ClassBody, GymClass, Trainer } from "../types/gymClass"
import { fromLocalInput, toLocalInput } from "../utils/gymClass"

// The trainer choice for a class from before trainers were accounts: keep its old text name as it is.
const KEEP_OLD_NAME = "keep"

interface Props {
  /** The class being edited; leave out to create a new one. */
  gymClass?: GymClass
  /** The accounts with the Trainer role to choose from. */
  trainers: Trainer[]
  saving: boolean
  error: string
  onSave: (body: ClassBody) => void
  onCancel?: () => void
}

type Errors = Partial<Record<"name" | "starts_at" | "duration" | "capacity", string>>

// One form for adding and editing a class, with the same checks the API makes.
export default function ClassForm({ gymClass, trainers, saving, error, onSave, onCancel }: Props) {
  const editing = gymClass !== undefined
  const oldName = gymClass && gymClass.trainer_id === null ? gymClass.trainer_name : null
  // The class's own trainer stays a choice even before the list loads (or if it fails to).
  const choices =
    gymClass?.trainer_id && !trainers.some((t) => t.id === gymClass.trainer_id)
      ? [{ id: gymClass.trainer_id, name: gymClass.trainer_name ?? "Current trainer" }, ...trainers]
      : trainers
  const [form, setForm] = useState({
    name: gymClass?.name ?? "",
    // A trainer's id, KEEP_OLD_NAME, or "" for no trainer.
    trainer: gymClass?.trainer_id ? String(gymClass.trainer_id) : oldName ? KEEP_OLD_NAME : "",
    description: gymClass?.description ?? "",
    starts_at: gymClass ? toLocalInput(gymClass.starts_at) : "",
    duration: String(gymClass?.duration_minutes ?? 60),
    capacity: String(gymClass?.capacity ?? 20),
  })
  const [errors, setErrors] = useState<Errors>({})
  const id = editing ? `edit-class-${gymClass.id}` : "add-class"
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const duration = Number(form.duration)
    const capacity = Number(form.capacity)
    const next: Errors = {}
    if (!form.name.trim()) next.name = "Enter the class name."
    if (!form.starts_at) next.starts_at = "Pick the start date and time."
    if (!Number.isInteger(duration) || duration < 15 || duration > 240) next.duration = "Use 15 to 240 minutes."
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 200) next.capacity = "Use 1 to 200 places."
    else if (editing && capacity < gymClass.booked_count) next.capacity = `${gymClass.booked_count} already booked.`
    setErrors(next)
    if (Object.keys(next).length) return
    onSave({
      name: form.name.trim(),
      // Left out, the old text name stays; otherwise the chosen trainer (or none) replaces it.
      trainer_id: form.trainer === KEEP_OLD_NAME ? undefined : form.trainer ? Number(form.trainer) : null,
      description: form.description.trim() || null,
      starts_at: fromLocalInput(form.starts_at),
      duration_minutes: duration,
      capacity,
    })
  }

  return (
    <form className="fields" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor={`${id}-name`}>Class name</label>
        <input id={`${id}-name`} value={form.name} onChange={set("name")} maxLength={100} placeholder="Morning Yoga" autoComplete="off" />
        {errors.name && <span className="field-error">{errors.name}</span>}
      </div>
      <div className="field">
        <label htmlFor={`${id}-trainer`}>Trainer (optional)</label>
        <select id={`${id}-trainer`} value={form.trainer} onChange={set("trainer")} aria-describedby={choices.length === 0 ? `${id}-trainer-hint` : undefined}>
          <option value="">No trainer</option>
          {oldName && <option value={KEEP_OLD_NAME}>{oldName} (name only)</option>}
          {choices.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {choices.length === 0 && (
          <span id={`${id}-trainer-hint`} className="hint">
            No trainers yet. An admin gives the Trainer role on the Users page.
          </span>
        )}
      </div>
      <div className="field">
        <label htmlFor={`${id}-starts`}>Starts</label>
        <input id={`${id}-starts`} type="datetime-local" value={form.starts_at} onChange={set("starts_at")} />
        {errors.starts_at && <span className="field-error">{errors.starts_at}</span>}
      </div>
      <div className="field">
        <label htmlFor={`${id}-duration`}>Minutes</label>
        <input id={`${id}-duration`} type="number" min={15} max={240} value={form.duration} onChange={set("duration")} />
        {errors.duration && <span className="field-error">{errors.duration}</span>}
      </div>
      <div className="field">
        <label htmlFor={`${id}-capacity`}>Places</label>
        <input
          id={`${id}-capacity`}
          type="number"
          min={Math.max(1, gymClass?.booked_count ?? 1)}
          max={200}
          value={form.capacity}
          onChange={set("capacity")}
        />
        {errors.capacity && <span className="field-error">{errors.capacity}</span>}
      </div>
      <div className="field wide">
        <label htmlFor={`${id}-description`}>Description (optional)</label>
        <textarea id={`${id}-description`} value={form.description} onChange={set("description")} maxLength={500} placeholder="Gentle flow for all levels" />
      </div>
      <div className="field wide actions">
        <button className="primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : editing ? "Save class" : "Add class"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
        <span className="hint">Times are in your local time.</span>
      </div>
      {error && (
        <p className="error wide-error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
