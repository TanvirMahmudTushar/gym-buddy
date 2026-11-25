import { type FormEvent, useState } from "react"
import type { GroupMember, Workout } from "../types/workout"
import { gymToday } from "../utils/time"
import { EARLIEST_WORKOUT_DATE, latestWorkoutDate } from "../utils/workout"
import FieldError from "./FieldError"
import FormActions from "./FormActions"

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
  /** The people in the group a new workout can be assigned to. Leave out when I may not assign. */
  assignees?: GroupMember[]
  saving: boolean
  error: string
  onSave: (values: WorkoutFormValues) => void
  onCancel: () => void
}

type Errors = Partial<Record<"title" | "workout_date", string>>

// One form for adding and editing a workout, with the same checks the API makes.
export default function WorkoutForm({ workout, assignees, saving, error, onSave, onCancel }: Props) {
  const editing = workout !== undefined
  const [form, setForm] = useState({
    title: workout?.title ?? "",
    workout_date: workout?.workout_date ?? gymToday(),
    notes: workout?.notes ?? "",
    assigned_to: "",
  })
  const [errors, setErrors] = useState<Errors>({})
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
      <div className="field wide">
        <label htmlFor="workout-title">Title</label>
        <input id="workout-title" value={form.title} onChange={set("title")} maxLength={100} placeholder="Leg day" autoComplete="off" autoFocus />
        <FieldError>{errors.title}</FieldError>
      </div>
      <div className="field">
        <label htmlFor="workout-date">Date</label>
        <input id="workout-date" type="date" min={EARLIEST_WORKOUT_DATE} max={latest} value={form.workout_date} onChange={set("workout_date")} />
        <FieldError>{errors.workout_date}</FieldError>
      </div>
      {!editing && assignees && (
        <div className="field">
          <label htmlFor="workout-assignee">Assign to (optional)</label>
          <select id="workout-assignee" value={form.assigned_to} onChange={set("assigned_to")}>
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
        <label htmlFor="workout-notes">Notes (optional)</label>
        <textarea
          id="workout-notes"
          value={form.notes}
          onChange={set("notes")}
          maxLength={1000}
          rows={4}
          placeholder="Squats 5×5 at 60 kg, then 20 minutes on the bike"
        />
      </div>
      <FormActions label={editing ? "Save changes" : "Add workout"} saving={saving} error={error} onCancel={onCancel} />
    </form>
  )
}
