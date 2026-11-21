import { useState } from "react"
import { deleteAnnouncement, updateAnnouncement } from "../services/announcementService"
import type { Announcement, AnnouncementBody } from "../types/announcement"
import { endNote, hasEnded, postedNote } from "../utils/announcement"
import { errorText } from "../utils/member"
import AnnouncementForm from "./AnnouncementForm"

interface Props {
  announcement: Announcement
  onChanged: (updated: Announcement) => void
  onDeleted: (id: number) => void
}

// One announcement on the Announcements page (gym managers and admins): the text, when it ends, and Edit / Delete.
export default function AnnouncementItem({ announcement: a, onChanged, onDeleted }: Props) {
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const ended = hasEnded(a)

  async function save(body: AnnouncementBody) {
    setBusy(true)
    setError("")
    try {
      onChanged(await updateAnnouncement(a.id, body))
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
      await deleteAnnouncement(a.id)
      onDeleted(a.id)
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  if (editing)
    return (
      <li className="class-item">
        <h3>Edit announcement</h3>
        <AnnouncementForm
          announcement={a}
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
        <h3 className="wrap-text">{a.title}</h3>
        <span className={ended ? "pill expired" : "pill active"}>{ended ? "Ended" : "Showing"}</span>
      </div>
      <p className="announcement-message">{a.message}</p>
      <p className="hint">
        {postedNote(a)} · {endNote(a)}
      </p>
      <div className="actions">
        <button type="button" onClick={() => setEditing(true)} disabled={busy}>
          Edit
        </button>
        <button type="button" className="danger" onClick={() => setConfirmingDelete(true)} disabled={busy}>
          Delete
        </button>
      </div>
      {confirmingDelete && (
        <div className="confirm" role="alertdialog" aria-labelledby={`confirm-announcement-${a.id}`}>
          <span id={`confirm-announcement-${a.id}`}>
            Delete "{a.title}"? {ended ? "It has already ended." : "Members stop seeing it straight away."} This cannot be undone.
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
