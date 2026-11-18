import { type FormEvent, useState } from "react"
import type { ClassBody, GymClass } from "../types/gymClass"
import { fromLocalInput, toLocalInput } from "../utils/gymClass"

interface Props {
  /** The class being edited; leave out to create a new one. */
  gymClass?: GymClass
  saving: boolean
  error: string
  onSave: (body: ClassBody) => void
  onCancel?: () => void
}

type Errors = Partial<Record<"name" | "starts_at" | "duration" | "capacity", string>>

// One form for adding and editing a class, with the same checks the API makes.
export default function ClassForm({ gymClass, saving, error, onSave, onCancel }: Props) {
  const editing = gymClass !== undefined
  const [form, setForm] = useState({
    name: gymClass?.name ?? "",
    trainer_name: gymClass?.trainer_name ?? "",
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
      trainer_name: form.trainer_name.trim() || null,
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
        <input id={`${id}-trainer`} value={form.trainer_name} onChange={set("trainer_name")} maxLength={100} placeholder="Lina" autoComplete="off" />
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
