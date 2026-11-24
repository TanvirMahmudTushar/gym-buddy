import { useState } from "react"
import { assignWorkout, completeWorkout, deleteWorkout, updateWorkout } from "../services/workoutService"
import type { GroupMember, Workout } from "../types/workout"
import { errorText, formatDate, formatDateTime } from "../utils/member"
import { groupLink } from "../utils/workout"
import WorkoutForm, { type WorkoutFormValues } from "./WorkoutForm"

interface Props {
  workout: Workout
  /** My account id: only the person a workout is assigned to marks it done. */
  meId: number
  /** Edit and Delete: the update permission in its group. */
  canEdit: boolean
  /** The Assign to list: the assign permission in its group. */
  canAssign?: boolean
  /** The people in the group, for the Assign to list. */
  members?: GroupMember[]
  /** Shows which group it is in, with a link (on Assigned to me). */
  showGroup?: boolean
  onChanged: (updated: Workout) => void
  onDeleted: (id: number) => void
}

// One workout: title, date and notes, who added it and who it is for, and the buttons my permissions allow.
export default function WorkoutItem({ workout: w, meId, canEdit, canAssign = false, members = [], showGroup = false, onChanged, onDeleted }: Props) {
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError("")
    try {
      await action()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const save = (values: WorkoutFormValues) =>
    run(async () => {
      onChanged(await updateWorkout(w.id, { title: values.title, workout_date: values.workout_date, notes: values.notes }))
      setEditing(false)
    })

  const assign = (value: string) => run(async () => onChanged(await assignWorkout(w.id, value ? Number(value) : null)))

  const isMine = w.assigned_to === meId
  const mark = (done: boolean) => run(async () => onChanged(await completeWorkout(w.id, done)))

  const remove = () =>
    run(async () => {
      await deleteWorkout(w.id)
      onDeleted(w.id)
    })

  if (editing)
    return (
      <li className="class-item">
        <h3>Edit workout</h3>
        <WorkoutForm
          workout={w}
          saving={busy}
          error={error}
          onSave={save}
          onCancel={() => {
            setEditing(false)
            setError("")
          }}
        />
      </li>
    )

  // Someone who left the group can still be named on an old workout until it is reassigned.
  const assigneeGone = w.assigned_to !== null && !members.some((m) => m.user_id === w.assigned_to)

  return (
    <li className="class-item">
      <div className="toolbar">
        <h3 className="wrap-text">{w.title}</h3>
        <span className="hint">
          {formatDate(w.workout_date)}{" "}
          {w.assigned_to !== null && <span className={w.completed_at ? "pill active" : "pill neutral"}>{w.completed_at ? "Done" : "To do"}</span>}
        </span>
      </div>
      {w.notes && <p className="announcement-message">{w.notes}</p>}
      <p className="hint">
        {showGroup && w.group_id !== null && (
          <>
            In <a href={groupLink(w.group_id)}>{w.group_name}</a> ·{" "}
          </>
        )}
        Added by {w.owner_name ?? "a deleted account"}
        {w.assigned_to_name && <> · For {w.assigned_to_name}</>}
        {w.completed_at && <> · Done {formatDateTime(w.completed_at)}</>}
      </p>
      {(canEdit || canAssign || isMine) && (
        <div className="actions">
          {isMine && (
            <button type="button" className={w.completed_at ? undefined : "primary"} onClick={() => mark(!w.completed_at)} disabled={busy}>
              {w.completed_at ? "Not done yet" : "Mark as done"}
            </button>
          )}
          {canAssign && (
            <label className="inline-select">
              Assign to{" "}
              <select value={w.assigned_to ?? ""} onChange={(e) => assign(e.target.value)} disabled={busy} aria-label={`Assign ${w.title} to`}>
                <option value="">Nobody</option>
                {assigneeGone && <option value={w.assigned_to ?? ""}>{w.assigned_to_name}</option>}
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {canEdit && (
            <>
              <button type="button" onClick={() => setEditing(true)} disabled={busy}>
                Edit
              </button>
              <button type="button" className="danger" onClick={() => setConfirmingDelete(true)} disabled={busy}>
                Delete
              </button>
            </>
          )}
        </div>
      )}
      {confirmingDelete && (
        <div className="confirm" role="alertdialog" aria-labelledby={`confirm-workout-${w.id}`}>
          <span id={`confirm-workout-${w.id}`}>
            Delete "{w.title}"? Everyone in the group stops seeing it. This cannot be undone.
          </span>
          <div className="actions">
            <button type="button" className="danger solid" onClick={remove} disabled={busy}>
              {busy ? "Deleting…" : "Yes, delete"}
            </button>
            <button type="button" onClick={() => setConfirmingDelete(false)} disabled={busy}>
              Keep it
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </li>
  )
}
