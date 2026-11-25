import { type ReactNode, useState } from "react"
import { errorText } from "../utils/text"
import Alert from "./Alert"
import Modal from "./Modal"

interface Props {
  title: string
  /** What will happen. */
  children: ReactNode
  confirmLabel: string
  busyLabel: string
  /** Closing the dialog afterwards is the caller's job. */
  onConfirm: () => Promise<unknown>
  onClose: () => void
}

// Asks before something that cannot be undone, runs it, and shows why it failed if it does.
export default function ConfirmModal({ title, children, confirmLabel, busyLabel, onConfirm, onClose }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function confirm() {
    setBusy(true)
    setError("")
    try {
      await onConfirm()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <Modal title={title} onClose={onClose} narrow>
      <p>{children}</p>
      <Alert>{error}</Alert>
      <div className="actions end">
        <button type="button" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="danger solid" onClick={confirm} disabled={busy}>
          {busy ? busyLabel : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
