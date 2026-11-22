import { type FormEvent, useState } from "react"
import type { GroupMember, Workout } from "../types/workout"
import { todayUtc } from "../utils/member"
import { EARLIEST_WORKOUT_DATE, latestWorkoutDate } from "../utils/workout"

export interface WorkoutFormValues {
  title: string
  workout_date: string
  notes: string | null
  /** Only when adding to a group, by someone who may assign. */
  assigned_to?: number
}

interface Props {
  /** The workout being edited; leave out to add a new one. */
  workout?: Workout
  /** The people in the group a new workout can be assigned to. Leave out when I may not assign, or it is personal. */
  assignees?: GroupMember[]
  saving: boolean
  error: string
  onSave: (values: WorkoutFormValues) => void
  onCancel?: () => void
}

type Errors = Partial<Record<"title" | "workout_date", string>>

// One form for adding and editing a workout, with the same checks the API makes.
export default function WorkoutForm({ workout, assignees, saving, error, onSave, onCancel }: Props) {
  const editing = workout !== undefined
  const [form, setForm] = useState({
    title: workout?.title ?? "",
    workout_date: workout?.workout_date ?? todayUtc(),
    notes: workout?.notes ?? "",
    assigned_to: "",
  })
  const [errors, setErrors] = useState<Errors>({})
  const id = editing ? `edit-workout-${workout.id}` : "add-workout"
  const latest = latestWorkoutDate()
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const next: Errors = {}
    if (!form.title.trim()) next.title = "Enter a title."
    if (!form.workout_date) next.workout_date = "Pick a date."
    else if (form.workout_date < EARLIEST_WORKOUT_DATE || form.workout_date > latest)
      next.workout_date = "Pick a date from 2000 up to a year from today."
    setErrors(next)
    if (Object.keys(next).length) return
    onSave({
      title: form.title.trim(),
      workout_date: form.workout_date,
      notes: form.notes.trim() || null,
      assigned_to: form.assigned_to ? Number(form.assigned_to) : undefined,
    })
  }

  return (
    <form className="fields" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor={`${id}-title`}>Title</label>
        <input id={`${id}-title`} value={form.title} onChange={set("title")} maxLength={100} placeholder="Leg day" autoComplete="off" />
        {errors.title && <span className="field-error">{errors.title}</span>}
      </div>
      <div className="field">
        <label htmlFor={`${id}-date`}>Date</label>
        <input id={`${id}-date`} type="date" min={EARLIEST_WORKOUT_DATE} max={latest} value={form.workout_date} onChange={set("workout_date")} />
        {errors.workout_date && <span className="field-error">{errors.workout_date}</span>}
      </div>
      {!editing && assignees && (
        <div className="field">
          <label htmlFor={`${id}-assignee`}>Assign to (optional)</label>
          <select id={`${id}-assignee`} value={form.assigned_to} onChange={set("assigned_to")}>
            <option value="">Nobody</option>
            {assignees.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="field wide">
        <label htmlFor={`${id}-notes`}>Notes (optional)</label>
        <textarea
          id={`${id}-notes`}
          value={form.notes}
          onChange={set("notes")}
          maxLength={1000}
          rows={3}
          placeholder="Squats 5×5 at 60 kg, then 20 minutes on the bike"
        />
      </div>
      <div className="field wide actions">
        <button className="primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : editing ? "Save workout" : "Add workout"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
      </div>
      {error && (
        <p className="error wide-error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
