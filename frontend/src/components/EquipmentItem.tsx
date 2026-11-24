import { type FormEvent, useState } from "react"
import { deleteEquipment, recordService, reportFault, updateEquipment } from "../services/equipmentService"
import type { Equipment } from "../types/equipment"
import { categoryLabel, isServiceDue, statusInfo } from "../utils/equipment"
import { errorText, formatDate, formatDateTime } from "../utils/member"
import EquipmentForm from "./EquipmentForm"

interface Props {
  item: Equipment
  /** Edit, service and delete: gym managers and admins. Trainers only report faults. */
  canManage: boolean
  /** Something changed: the list loads again, because the item may no longer match its filter. */
  onChanged: () => void
}

// One machine (or set): whether it works, its reported fault and its next service.
export default function EquipmentItem({ item, canManage, onChanged }: Props) {
  const [mode, setMode] = useState<"view" | "edit" | "report" | "delete">("view")
  const [issue, setIssue] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const status = statusInfo(item.status)

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError("")
    try {
      await action()
      setMode("view")
      setIssue("")
      onChanged()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const back = () => {
    setMode("view")
    setError("")
  }

  function submitReport(e: FormEvent) {
    e.preventDefault()
    if (!issue.trim()) {
      setError("Say what is wrong.")
      return
    }
    void run(() => reportFault(item.id, issue.trim()))
  }

  if (mode === "edit")
    return (
      <li className="class-item">
        <h3>Edit equipment</h3>
        <EquipmentForm item={item} saving={busy} error={error} onSave={(body) => run(() => updateEquipment(item.id, body))} onCancel={back} />
      </li>
    )

  return (
    <li className="class-item">
      <div className="toolbar">
        <h3 className="wrap-text">
          {item.name} {item.quantity > 1 && <span className="hint">× {item.quantity}</span>}
        </h3>
        <span className={status.pill}>{status.label}</span>
      </div>
      <p className="hint">
        {categoryLabel(item.category)}
        {item.purchased_on && ` · bought ${formatDate(item.purchased_on)}`}
        {item.last_serviced_on && ` · last serviced ${formatDate(item.last_serviced_on)}`}
        {item.next_service_on && (
          <>
            {" "}
            · next service {formatDate(item.next_service_on)} {isServiceDue(item) && <span className="pill expired">Due</span>}
          </>
        )}
      </p>
      {item.issue && (
        <p className="wrap-text">
          <strong>Fault:</strong> {item.issue}{" "}
          <span className="hint">
            reported{item.reported_by_name && ` by ${item.reported_by_name}`}
            {item.reported_at && ` on ${formatDateTime(item.reported_at)}`}
          </span>
        </p>
      )}
      {item.notes && <p className="announcement-message hint">{item.notes}</p>}
      {mode === "view" && (
        <div className="actions">
          <button type="button" onClick={() => setMode("report")} disabled={busy}>
            Report a fault
          </button>
          {canManage && (
            <>
              {item.status === "out_of_order" && (
                <button type="button" onClick={() => run(() => updateEquipment(item.id, { status: "maintenance" }))} disabled={busy}>
                  Being repaired
                </button>
              )}
              <button type="button" onClick={() => run(() => recordService(item.id))} disabled={busy}>
                {item.status === "working" ? "Serviced today" : "Fixed today"}
              </button>
              <button type="button" onClick={() => setMode("edit")} disabled={busy}>
                Edit
              </button>
              <button type="button" className="danger" onClick={() => setMode("delete")} disabled={busy}>
                Delete
              </button>
            </>
          )}
        </div>
      )}
      {mode === "report" && (
        <form className="inline" onSubmit={submitReport} noValidate>
          <div className="field">
            <label htmlFor={`issue-${item.id}`}>What is wrong?</label>
            <input id={`issue-${item.id}`} value={issue} onChange={(e) => setIssue(e.target.value)} maxLength={500} autoFocus autoComplete="off" />
          </div>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "Reporting…" : "Report"}
          </button>
          <button type="button" onClick={back} disabled={busy}>
            Cancel
          </button>
        </form>
      )}
      {mode === "delete" && (
        <div className="confirm" role="alertdialog" aria-labelledby={`delete-equipment-${item.id}`}>
          <span id={`delete-equipment-${item.id}`}>Delete {item.name} from the equipment list? This cannot be undone.</span>
          <div className="actions">
            <button type="button" className="danger solid" onClick={() => run(() => deleteEquipment(item.id))} disabled={busy}>
              {busy ? "Deleting…" : "Yes, delete"}
            </button>
            <button type="button" onClick={back} disabled={busy}>
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
