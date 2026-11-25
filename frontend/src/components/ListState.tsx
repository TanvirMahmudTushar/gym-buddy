import type { ReactNode } from "react"
import Alert from "./Alert"

interface Props {
  loading: boolean
  error: string
  isEmpty: boolean
  /** Shown when there is nothing to list. */
  empty: ReactNode
  children: ReactNode
}

// The four states of every list: loading, failed, empty, or the rows. The rows stay on screen while they load again,
// so the list does not flicker after each change.
export default function ListState({ loading, error, isEmpty, empty, children }: Props) {
  return (
    <>
      <Alert>{error}</Alert>
      {!isEmpty ? children : loading ? <p className="empty">Loading…</p> : !error && <p className="empty">{empty}</p>}
    </>
  )
}
