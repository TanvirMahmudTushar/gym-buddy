import { type FormEvent, useState } from "react"
import { bulkBan, bulkUnban } from "../services/adminService"
import type { SkippedUser } from "../types/auth"
import { errorText } from "../utils/member"

// The API accepts this many ids in one request.
const MAX_AT_ONCE = 100

interface Props {
  ids: number[]
  /** Called after the request, with a sentence saying what happened, including who was skipped and why. */
  onDone: (message: string) => void
  onClear: () => void
}

/** "Skipped: Abe Admin (You cannot ban an admin; …), #42 (No user has this id)." */
function skippedText(skipped: SkippedUser[]): string {
  if (skipped.length === 0) return ""
  return ` Skipped: ${skipped.map((s) => `${s.name ?? `#${s.id}`} (${s.reason})`).join(", ")}.`
}

// Ban or unban every user ticked in the list, with one reason. One admin in the list does not stop the others:
// the API skips yourself, admins and accounts with nothing to change, and says why.
export default function UserBulkBar({ ids, onDone, onClear }: Props) {
  const [mode, setMode] = useState<"ban" | "unban" | null>(null)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const label = `${ids.length} user${ids.length === 1 ? "" : "s"}`
  const tooMany = ids.length > MAX_AT_ONCE

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError("")
    try {
      if (mode === "ban") {
        const result = await bulkBan(ids, reason.trim())
        onDone(`Banned ${result.banned.length} of ${label}; they are logged out on their next request.${skippedText(result.skipped)}`)
      } else {
        const result = await bulkUnban(ids, reason.trim())
        onDone(`Unbanned ${result.unbanned.length} of ${label}.${skippedText(result.skipped)}`)
      }
      setMode(null)
      setReason("")
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
          <button type="button" onClick={() => setMode("unban")} disabled={busy || tooMany}>
            Unban selected
          </button>
          <button type="button" className="danger" onClick={() => setMode("ban")} disabled={busy || tooMany}>
            Ban selected
          </button>
        </div>
      </div>
      {tooMany && <p className="error">Select up to {MAX_AT_ONCE} users at a time.</p>}
      {mode && !tooMany && (
        <form className="confirm" onSubmit={submit} aria-label={mode === "ban" ? "Ban the selected users" : "Unban the selected users"}>
          <div className="field">
            <label htmlFor="bulk-reason">
              {mode === "ban" ? `Reason for banning ${label} (optional)` : `Reason for unbanning ${label} (optional, kept in the activity log)`}
            </label>
            <input id="bulk-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} autoFocus autoComplete="off" />
          </div>
          <span className="hint">
            {mode === "ban"
              ? "Admins and you are skipped. Everyone else is logged out at once and cannot log in until unbanned."
              : "Only banned accounts change. Their old sessions stay ended; they log in again."}
          </span>
          <div className="actions">
            <button type="submit" className={mode === "ban" ? "danger solid" : "primary"} disabled={busy}>
              {busy ? "Working…" : mode === "ban" ? `Ban ${label}` : `Unban ${label}`}
            </button>
            <button type="button" onClick={() => setMode(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
