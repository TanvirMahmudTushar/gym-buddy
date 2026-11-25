import { useState } from "react"
import { useSave } from "../hooks/useSave"
import { assignWorkout, completeWorkout, deleteWorkout, updateWorkout } from "../services/workoutService"
import type { GroupMember, Workout } from "../types/workout"
import { formatDate, formatDateTime } from "../utils/time"
import { groupLink } from "../utils/workout"
import Alert from "./Alert"
import ConfirmModal from "./ConfirmModal"
import Icon from "./Icon"
import Modal from "./Modal"
import WorkoutForm, { type WorkoutFormValues } from "./WorkoutForm"

interface Props {
  workout: Workout
  /** My account id: only the person a workout is assigned to marks it done. */
  meId: number
  /** Edit: the update permission in its group. */
  canEdit?: boolean
  /** Delete: only the group's owner. */
  canDelete?: boolean
  /** The Assign to list: the assign permission in its group. */
  canAssign?: boolean
  /** The people in the group, for the Assign to list. */
  members?: GroupMember[]
  /** Shows which group it is in, with a link (on Assigned to me). */
  showGroup?: boolean
  onChanged: (updated: Workout) => void
  onDeleted?: () => void
}

// One workout: title, date and notes, who added it and who it is for, and the buttons my permissions allow.
export default function WorkoutItem({ workout: w, meId, canEdit = false, canDelete = false, canAssign = false, members = [], showGroup = false, onChanged, onDeleted }: Props) {
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null)
  const { saving, error, setError, run } = useSave()

  function close() {
    setDialog(null)
    setError("")
  }

  const save = (values: WorkoutFormValues) =>
    run(async () => {
      onChanged(await updateWorkout(w.id, { title: values.title, workout_date: values.workout_date, notes: values.notes }))
      setDialog(null)
    })

  const assign = (value: string) => run(async () => onChanged(await assignWorkout(w.id, value ? Number(value) : null)))

  const isMine = w.assigned_to === meId
  const mark = (done: boolean) => run(async () => onChanged(await completeWorkout(w.id, done)))

  return (
    <li className="item">
      <div className="item-head">
        <h2>{w.title}</h2>
        {w.assigned_to !== null && <span className={w.completed_at ? "pill good" : "pill warn"}>{w.completed_at ? "Done" : "To do"}</span>}
      </div>
      <div className="meta">
        <span>
          <Icon name="classes" /> {formatDate(w.workout_date)}
        </span>
        {!isMine && (
          <span>
            <Icon name="users" /> {w.assigned_to_name ? `For ${w.assigned_to_name}` : "Not assigned"}
          </span>
        )}
        {showGroup && w.group_id !== null && (
          <span>
            <Icon name="training" /> <a href={groupLink(w.group_id)}>{w.group_name}</a>
          </span>
        )}
      </div>
      {w.notes && <p className="prose">{w.notes}</p>}
      <p className="hint">
        Added by {w.owner_name ?? "a deleted account"}
        {w.completed_at && `, done ${formatDateTime(w.completed_at)}`}
      </p>
      {canAssign && (
        <div className="field">
          <label htmlFor={`assign-${w.id}`}>Assign to</label>
          <select id={`assign-${w.id}`} value={w.assigned_to ?? ""} onChange={(e) => assign(e.target.value)} disabled={saving}>
            <option value="">Nobody</option>
            {/* Someone who left the group can still be named on a workout until the list loads again. */}
            {w.assigned_to !== null && !members.some((m) => m.user_id === w.assigned_to) && <option value={w.assigned_to}>{w.assigned_to_name}</option>}
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {dialog === null && <Alert>{error}</Alert>}
      {(canEdit || canDelete || isMine) && (
        <div className="actions">
          {isMine && (
            <button type="button" className={w.completed_at ? "small" : "small primary"} onClick={() => mark(!w.completed_at)} disabled={saving}>
              {w.completed_at ? "Not done yet" : "Mark as done"}
            </button>
          )}
          {canEdit && (
            <button type="button" className="small" onClick={() => setDialog("edit")} disabled={saving}>
              Edit
            </button>
          )}
          {canDelete && (
            <button type="button" className="small danger" onClick={() => setDialog("delete")} disabled={saving}>
              Delete
            </button>
          )}
        </div>
      )}
      {dialog === "edit" && (
        <Modal title="Edit workout" onClose={close}>
          <WorkoutForm workout={w} saving={saving} error={error} onSave={save} onCancel={close} />
        </Modal>
      )}
      {dialog === "delete" && (
        <ConfirmModal
          title={`Delete "${w.title}"?`}
          confirmLabel="Delete workout"
          busyLabel="Deleting…"
          onClose={close}
          onConfirm={async () => {
            await deleteWorkout(w.id)
            setDialog(null)
            onDeleted?.()
          }}
        >
          Everyone in the group stops seeing it. This cannot be undone.
        </ConfirmModal>
      )}
    </li>
  )
}
