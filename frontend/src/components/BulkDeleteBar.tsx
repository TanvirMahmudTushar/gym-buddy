import { useState } from "react"
import { deleteMembers } from "../services/memberService"
import { errorText } from "../utils/member"

// The API accepts this many IDs in one request.
const MAX_AT_ONCE = 100

interface Props {
  ids: number[]
  onDeleted: (ids: number[]) => void
  onClear: () => void
}

export default function BulkDeleteBar({ ids, onDeleted, onClear }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const label = `${ids.length} member${ids.length === 1 ? "" : "s"}`
  const tooMany = ids.length > MAX_AT_ONCE

  async function remove() {
    setBusy(true)
    setError("")
    try {
      await deleteMembers(ids)
      onDeleted(ids)
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
      {tooMany && <p className="error">Select up to {MAX_AT_ONCE} members at a time.</p>}
      {confirming && !tooMany && (
        <div className="confirm" role="alertdialog" aria-labelledby="bulk-confirm-text">
          <span id="bulk-confirm-text">Delete {label}? This cannot be undone.</span>
          <div className="actions">
            <button type="button" className="danger solid" onClick={remove} disabled={busy}>
              {busy ? "Deleting…" : `Yes, delete ${label}`}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy}>
              Keep members
            </button>
          </div>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
