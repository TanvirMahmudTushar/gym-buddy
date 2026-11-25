import { useState } from "react"
import { useSave } from "../hooks/useSave"
import { deleteAnnouncement, updateAnnouncement } from "../services/announcementService"
import type { Announcement, AnnouncementBody } from "../types/announcement"
import { endNote, hasEnded, postedNote } from "../utils/announcement"
import AnnouncementForm from "./AnnouncementForm"
import ConfirmModal from "./ConfirmModal"
import Modal from "./Modal"

interface Props {
  announcement: Announcement
  /** An edit can change the end date and a delete removes it, so the list loads again. */
  onChanged: () => void
}

// One announcement on the Announcements page (gym managers and admins): the text, when it ends, and Edit / Delete.
export default function AnnouncementItem({ announcement: a, onChanged }: Props) {
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null)
  const { saving, error, setError, run } = useSave()
  const ended = hasEnded(a)

  function close() {
    setDialog(null)
    setError("")
  }

  const save = (body: AnnouncementBody) =>
    run(async () => {
      await updateAnnouncement(a.id, body)
      close()
      onChanged()
    })

  return (
    <li className="item">
      <div className="item-head">
        <h2>{a.title}</h2>
        <span className={ended ? "pill" : "pill good"}>{ended ? "Ended" : "Showing"}</span>
      </div>
      <p className="prose">{a.message}</p>
      <div className="meta">
        <span>{postedNote(a)}</span>
        <span>{endNote(a)}</span>
      </div>
      <div className="actions">
        <button type="button" className="small" onClick={() => setDialog("edit")}>
          Edit
        </button>
        <button type="button" className="small danger" onClick={() => setDialog("delete")}>
          Delete
        </button>
      </div>
      {dialog === "edit" && (
        <Modal title="Edit announcement" onClose={close}>
          <AnnouncementForm announcement={a} saving={saving} error={error} onSave={save} onCancel={close} />
        </Modal>
      )}
      {dialog === "delete" && (
        <ConfirmModal
          title={`Delete "${a.title}"?`}
          confirmLabel="Delete"
          busyLabel="Deleting…"
          onClose={close}
          onConfirm={async () => {
            await deleteAnnouncement(a.id)
            onChanged()
          }}
        >
          {ended ? "It has already ended." : "Members stop seeing it straight away."} This cannot be undone.
        </ConfirmModal>
      )}
    </li>
  )
}
