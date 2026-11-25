import { useState } from "react"
import { useSave } from "../hooks/useSave"
import { deleteClass, updateClass } from "../services/classService"
import type { ClassBody, GymClass, Trainer } from "../types/gymClass"
import { count } from "../utils/text"
import { formatClassTime } from "../utils/time"
import ClassBookings from "./ClassBookings"
import ClassForm from "./ClassForm"
import ClassSummary from "./ClassSummary"
import ConfirmModal from "./ConfirmModal"
import Modal from "./Modal"

interface Props {
  gymClass: GymClass
  /** The choices for the class's trainer when editing. */
  trainers: Trainer[]
  /** An edit can change the start time, so the list loads again. */
  onChanged: () => void
}

// One class on the Classes page, with its bookings, Edit and Delete.
export default function ClassItem({ gymClass: c, trainers, onChanged }: Props) {
  const [dialog, setDialog] = useState<"bookings" | "edit" | "delete" | null>(null)
  const { saving, error, setError, run } = useSave()

  function close() {
    setDialog(null)
    setError("")
  }

  const save = (body: ClassBody) =>
    run(async () => {
      await updateClass(c.id, body)
      close()
      onChanged()
    })

  return (
    <li className="item">
      <ClassSummary gymClass={c} />
      <div className="actions">
        <button type="button" className="small" onClick={() => setDialog("bookings")}>
          Bookings
        </button>
        <button type="button" className="small" onClick={() => setDialog("edit")}>
          Edit
        </button>
        <button type="button" className="small danger" onClick={() => setDialog("delete")}>
          Delete
        </button>
      </div>
      {dialog === "bookings" && (
        <Modal title={`${c.name}, ${formatClassTime(c.starts_at)}`} onClose={close}>
          <ClassBookings classId={c.id} startsAt={c.starts_at} />
        </Modal>
      )}
      {dialog === "edit" && (
        <Modal title={`Edit ${c.name}`} onClose={close}>
          <ClassForm gymClass={c} trainers={trainers} saving={saving} error={error} onSave={save} onCancel={close} />
        </Modal>
      )}
      {dialog === "delete" && (
        <ConfirmModal
          title={`Delete ${c.name}?`}
          confirmLabel="Delete class"
          busyLabel="Deleting…"
          onClose={close}
          onConfirm={async () => {
            await deleteClass(c.id)
            onChanged()
          }}
        >
          {c.booked_count > 0 && `${count(c.booked_count, "booking")} will be deleted too. `}This cannot be undone.
        </ConfirmModal>
      )}
    </li>
  )
}
