import { useState } from "react"
import type { Selection } from "../hooks/useSelection"
import { count } from "../utils/text"
import ConfirmModal from "./ConfirmModal"

interface Props {
  selection: Selection
  /** "member", "workout" or "group", for the labels. */
  noun: string
  /** What else goes with them. */
  warning: string
  /** Deletes the ids; the caller then loads the list again. */
  onDelete: (ids: number[]) => Promise<void>
}

// Shown while rows are ticked: delete them all, after a question. A delete cannot be undone.
export default function BulkDelete({ selection, noun, warning, onDelete }: Props) {
  const [confirming, setConfirming] = useState(false)
  if (selection.ids.length === 0) return null
  const label = count(selection.ids.length, noun)

  return (
    <div className="bulk-bar">
      <span>{label} selected</span>
      <div className="actions">
        <button type="button" className="small" onClick={selection.clear}>
          Clear
        </button>
        <button type="button" className="small danger" onClick={() => setConfirming(true)}>
          Delete selected
        </button>
      </div>
      {confirming && (
        <ConfirmModal
          title={`Delete ${label}?`}
          confirmLabel={`Delete ${label}`}
          busyLabel="Deleting…"
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            await onDelete(selection.ids)
            selection.clear()
          }}
        >
          {warning} This cannot be undone.
        </ConfirmModal>
      )}
    </div>
  )
}
