import { type FormEvent, useState } from "react"
import { useSave } from "../hooks/useSave"
import { deleteEquipment, recordService, reportFault, updateEquipment } from "../services/equipmentService"
import type { Equipment } from "../types/equipment"
import { categoryLabel, isServiceDue, statusInfo } from "../utils/equipment"
import { formatDate } from "../utils/time"
import Alert from "./Alert"
import ConfirmModal from "./ConfirmModal"
import EquipmentForm from "./EquipmentForm"
import FormActions from "./FormActions"
import Modal from "./Modal"

interface Props {
  item: Equipment
  /** Edit, service and delete: gym managers and admins. Trainers only report faults. */
  canManage: boolean
  /** Something changed: the list loads again, because the item may no longer match its filter. */
  onChanged: () => void
}

// One machine (or set): whether it works, its reported fault and its next service.
export default function EquipmentItem({ item, canManage, onChanged }: Props) {
  const [dialog, setDialog] = useState<"edit" | "report" | "delete" | null>(null)
  const [issue, setIssue] = useState("")
  const { saving, error, setError, run } = useSave()
  const status = statusInfo(item.status)

  const act = (action: () => Promise<unknown>) =>
    run(async () => {
      await action()
      setDialog(null)
      setIssue("")
      onChanged()
    })

  function close() {
    setDialog(null)
    setError("")
  }

  function submitReport(e: FormEvent) {
    e.preventDefault()
    if (!issue.trim()) return setError("Say what is wrong.")
    void act(() => reportFault(item.id, issue.trim()))
  }

  return (
    <li className="item">
      <div className="item-head">
        <div>
          <h2>
            {item.name} {item.quantity > 1 && <span className="hint">× {item.quantity}</span>}
          </h2>
          <span className="hint">{categoryLabel(item.category)}</span>
        </div>
        <span className={status.pill}>{status.label}</span>
      </div>
      {item.issue && (
        <Alert kind="error">
          {item.issue} {item.reported_by_name && `(${item.reported_by_name}${item.reported_at ? `, ${formatDate(item.reported_at)}` : ""})`}
        </Alert>
      )}
      {(item.next_service_on || item.last_serviced_on || item.purchased_on) && (
        <dl className="facts">
          {item.next_service_on && (
            <>
              <dt>Next service</dt>
              <dd>
                {formatDate(item.next_service_on)} {isServiceDue(item) && <span className="pill warn">Due</span>}
              </dd>
            </>
          )}
          {item.last_serviced_on && (
            <>
              <dt>Last serviced</dt>
              <dd>{formatDate(item.last_serviced_on)}</dd>
            </>
          )}
          {item.purchased_on && (
            <>
              <dt>Bought</dt>
              <dd>{formatDate(item.purchased_on)}</dd>
            </>
          )}
        </dl>
      )}
      {item.notes && <p className="prose hint">{item.notes}</p>}
      {dialog === null && <Alert>{error}</Alert>}
      <div className="actions">
        {canManage && (
          <button type="button" className="small" onClick={() => act(() => recordService(item.id))} disabled={saving}>
            {item.status === "working" ? "Serviced" : "Fixed"}
          </button>
        )}
        {canManage && item.status === "out_of_order" && (
          <button type="button" className="small" onClick={() => act(() => updateEquipment(item.id, { status: "maintenance" }))} disabled={saving}>
            Being repaired
          </button>
        )}
        <button type="button" className="small" onClick={() => setDialog("report")} disabled={saving}>
          Report fault
        </button>
        {canManage && (
          <>
            <button type="button" className="small" onClick={() => setDialog("edit")} disabled={saving}>
              Edit
            </button>
            <button type="button" className="small danger" onClick={() => setDialog("delete")} disabled={saving}>
              Delete
            </button>
          </>
        )}
      </div>
      {dialog === "edit" && (
        <Modal title={`Edit ${item.name}`} onClose={close}>
          <EquipmentForm item={item} saving={saving} error={error} onSave={(body) => act(() => updateEquipment(item.id, body))} onCancel={close} />
        </Modal>
      )}
      {dialog === "report" && (
        <Modal title={`Report a fault: ${item.name}`} onClose={close} narrow>
          <form className="fields" onSubmit={submitReport} noValidate>
            <div className="field wide">
              <label htmlFor="equipment-issue">What is wrong?</label>
              <textarea id="equipment-issue" value={issue} onChange={(e) => setIssue(e.target.value)} maxLength={500} autoFocus />
            </div>
            <FormActions label="Report fault" saving={saving} error={error} onCancel={close} />
          </form>
        </Modal>
      )}
      {dialog === "delete" && (
        <ConfirmModal
          title={`Delete ${item.name}?`}
          confirmLabel="Delete"
          busyLabel="Deleting…"
          onClose={close}
          onConfirm={async () => {
            await deleteEquipment(item.id)
            onChanged()
          }}
        >
          It leaves the equipment list. This cannot be undone.
        </ConfirmModal>
      )}
    </li>
  )
}
