import { useState } from "react"
import { deleteClass, updateClass } from "../services/classService"
import type { ClassBody, GymClass, Trainer } from "../types/gymClass"
import { formatClassTime, isUpcoming } from "../utils/gymClass"
import { errorText } from "../utils/member"
import ClassBookings from "./ClassBookings"
import ClassForm from "./ClassForm"

interface Props {
  gymClass: GymClass
  /** The choices for the class's trainer when editing. */
  trainers: Trainer[]
  onChanged: (updated: GymClass) => void
  onDeleted: (id: number) => void
}

// One class in the list: its details, the people who booked it, and Edit / Delete.
export default function ClassItem({ gymClass: c, trainers, onChanged, onDeleted }: Props) {
  const [editing, setEditing] = useState(false)
  const [showBookings, setShowBookings] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const full = c.booked_count >= c.capacity
  const started = !isUpcoming(c.starts_at)

  async function save(body: ClassBody) {
    setBusy(true)
    setError("")
    try {
      onChanged(await updateClass(c.id, body))
      setEditing(false)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError("")
    try {
      await deleteClass(c.id)
      onDeleted(c.id)
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  if (editing)
    return (
      <li className="class-item">
        <h3>Edit class</h3>
        <ClassForm
          gymClass={c}
          trainers={trainers}
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

  return (
    <li className="class-item">
      <div className="toolbar">
        <h3>{c.name}</h3>
        <span className={full ? "pill expired" : "pill active"}>
          {c.booked_count} / {c.capacity} booked
        </span>
      </div>
      <p className="hint">
        {formatClassTime(c.starts_at)} · {c.duration_minutes} min{c.trainer_name ? ` · ${c.trainer_name}` : ""}
        {started && " · started"}
      </p>
      {c.description && <p>{c.description}</p>}
      <div className="actions">
        <button type="button" onClick={() => setShowBookings((v) => !v)} aria-expanded={showBookings}>
          {showBookings ? "Hide bookings" : "Bookings"}
        </button>
        <button type="button" onClick={() => setEditing(true)} disabled={busy}>
          Edit
        </button>
        <button type="button" className="danger" onClick={() => setConfirmingDelete(true)} disabled={busy}>
          Delete
        </button>
      </div>
      {showBookings && <ClassBookings classId={c.id} startsAt={c.starts_at} />}
      {confirmingDelete && (
        <div className="confirm" role="alertdialog" aria-labelledby={`confirm-class-${c.id}`}>
          <span id={`confirm-class-${c.id}`}>
            Delete {c.name}?{c.booked_count > 0 && ` Its ${c.booked_count} booking(s) are deleted too.`} This cannot be undone.
          </span>
          <div className="actions">
            <button type="button" className="danger solid" onClick={remove} disabled={busy}>
              {busy ? "Deleting…" : "Yes, delete"}
            </button>
            <button type="button" onClick={() => setConfirmingDelete(false)} disabled={busy}>
              Keep class
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
