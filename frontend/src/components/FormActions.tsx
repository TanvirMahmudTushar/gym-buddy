import Alert from "./Alert"

interface Props {
  label: string
  saving: boolean
  error: string
  /** Red button, for something that takes access or money away. */
  danger?: boolean
  onCancel: () => void
}

// The end of a form in a dialog: why saving failed, Cancel and Save.
export default function FormActions({ label, saving, error, danger = false, onCancel }: Props) {
  return (
    <>
      {error && (
        <div className="wide">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="wide actions end">
        <button type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button className={danger ? "danger solid" : "primary"} type="submit" disabled={saving}>
          {saving ? "Saving…" : label}
        </button>
      </div>
    </>
  )
}
