import { useState } from "react"
import Alert from "../../components/Alert"
import ConfirmModal from "../../components/ConfirmModal"
import Icon from "../../components/Icon"
import Modal from "../../components/Modal"
import PageHeader from "../../components/PageHeader"
import PlanForm from "../../components/PlanForm"
import { usePlans } from "../../context/PlansContext"
import { useSave } from "../../hooks/useSave"
import { createPlan, deletePlan, updatePlan } from "../../services/planService"
import type { MembershipPlan, PlanBody } from "../../types/payment"
import { formatMoney } from "../../utils/payment"

// One plan: its price and length, with Edit, Retire (or Offer again) and Delete.
function PlanItem({ plan, onSaved }: { plan: MembershipPlan; onSaved: () => Promise<void> }) {
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null)
  const { saving, error, setError, run } = useSave()

  const act = (action: () => Promise<unknown>) =>
    run(async () => {
      await action()
      setDialog(null)
      await onSaved()
    })

  function close() {
    setDialog(null)
    setError("")
  }

  return (
    <li className="item">
      <div className="item-head">
        <h2>{plan.name}</h2>
        {!plan.is_active && <span className="pill">Retired</span>}
      </div>
      <p className="summary">
        <strong>{formatMoney(plan.price)}</strong> <span className="hint">for {plan.duration_days} days</span>
      </p>
      {plan.description && <p className="wrap-text">{plan.description}</p>}
      {dialog === null && <Alert>{error}</Alert>}
      <div className="actions">
        <button type="button" className="small" onClick={() => setDialog("edit")} disabled={saving}>
          Edit
        </button>
        <button type="button" className="small" onClick={() => act(() => updatePlan(plan.plan, { is_active: !plan.is_active }))} disabled={saving}>
          {plan.is_active ? "Retire" : "Offer again"}
        </button>
        <button type="button" className="small danger" onClick={() => setDialog("delete")} disabled={saving}>
          Delete
        </button>
      </div>
      {dialog === "edit" && (
        <Modal title={`Edit ${plan.name}`} onClose={close}>
          <PlanForm plan={plan} saving={saving} error={error} onSave={(body) => act(() => updatePlan(plan.plan, body))} onCancel={close} />
        </Modal>
      )}
      {dialog === "delete" && (
        <ConfirmModal
          title={`Delete ${plan.name}?`}
          confirmLabel="Delete plan"
          busyLabel="Deleting…"
          onClose={close}
          onConfirm={async () => {
            await deletePlan(plan.plan)
            await onSaved()
          }}
        >
          Only a plan nobody ever had can be deleted; retire it instead if members or payments have it. This cannot be undone.
        </ConfirmModal>
      )}
    </li>
  )
}

// Admins only: the membership plans the gym sells.
export default function PlansPage() {
  const { plans, reload } = usePlans()
  const [adding, setAdding] = useState(false)
  const { saving, error, setError, run } = useSave()

  function close() {
    setAdding(false)
    setError("")
  }

  const add = (body: PlanBody) =>
    run(async () => {
      await createPlan(body)
      close()
      await reload()
    })

  return (
    <div className="page">
      <PageHeader title="Plans" subtitle="What the gym sells. Retire a plan to stop selling it: members who have it keep it, and payments already taken do not change.">
        <button type="button" className="primary" onClick={() => setAdding(true)}>
          <Icon name="plus" /> Add plan
        </button>
      </PageHeader>
      {plans.length === 0 ? (
        <p className="empty">No plans yet. Add the first one.</p>
      ) : (
        <ul className="card-grid">
          {plans.map((p) => (
            <PlanItem key={p.plan} plan={p} onSaved={reload} />
          ))}
        </ul>
      )}
      {adding && (
        <Modal title="Add a plan" onClose={close}>
          <PlanForm saving={saving} error={error} onSave={add} onCancel={close} />
        </Modal>
      )}
    </div>
  )
}
