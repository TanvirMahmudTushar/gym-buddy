import { useState } from "react"
import { errorText } from "../utils/member"

// The API accepts this many ids in one request.
const MAX_AT_ONCE = 100

interface Props {
  ids: number[]
  /** "workout" or "group", for the labels. */
  noun: string
  /** What else goes, shown in the confirm step (such as a group's workouts). */
  warning: string
  /** Deletes the ids and returns how many were deleted. */
  onDelete: (ids: number[]) => Promise<number>
  onDone: (message: string) => void
  onClear: () => void
}

// Training, All groups and All workouts: delete everything ticked, after a confirm step. A delete cannot be undone (there is no soft delete).
export default function ContentDeleteBar({ ids, noun, warning, onDelete, onDone, onClear }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const label = `${ids.length} ${noun}${ids.length === 1 ? "" : "s"}`
  const tooMany = ids.length > MAX_AT_ONCE

  async function remove() {
    setBusy(true)
    setError("")
    try {
      const deleted = await onDelete(ids)
      onDone(`Deleted ${deleted} ${noun}${deleted === 1 ? "" : "s"}. Each delete is recorded in the activity log.`)
      setConfirming(false)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bulk-bar">
      <div className="list-foot">
        <span>{label} selected</span>
        <div className="actions">
          <button type="button" onClick={onClear} disabled={busy}>
            Clear
          </button>
          <button type="button" className="danger" onClick={() => setConfirming(true)} disabled={busy || tooMany}>
            Delete selected
          </button>
        </div>
      </div>
      {tooMany && <p className="error">Select up to {MAX_AT_ONCE} at a time.</p>}
      {confirming && !tooMany && (
        <div className="confirm" role="alertdialog" aria-labelledby="content-delete-text">
          <span id="content-delete-text">
            Delete {label}? {warning} Their owners are not told, and this cannot be undone.
          </span>
          <div className="actions">
            <button type="button" className="danger solid" onClick={remove} disabled={busy}>
              {busy ? "Deleting…" : `Yes, delete ${label}`}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy}>
              Keep them
            </button>
          </div>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
