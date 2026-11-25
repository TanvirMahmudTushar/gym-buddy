import { type ReactNode, useEffect, useId, useRef } from "react"
import Icon from "./Icon"

interface Props {
  title: string
  onClose: () => void
  narrow?: boolean
  children: ReactNode
}

// A dialog over the page, for a form or a question. The browser's own <dialog> keeps the focus inside, closes on Esc
// and gives the focus back to the button that opened it. Render it only while it is open.
export default function Modal({ title, onClose, narrow = false, children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const id = useId()

  useEffect(() => {
    const el = dialog.current
    if (el && !el.open) el.showModal()
    return () => el?.close()
  }, [])

  return (
    <dialog
      ref={dialog}
      className={narrow ? "narrow" : undefined}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <div className="dialog-head">
        <h2 id={id}>{title}</h2>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div className="dialog-body">{children}</div>
    </dialog>
  )
}
