import { useState } from "react"
import PlanForm from "../../components/PlanForm"
import { usePlans } from "../../context/PlansContext"
import { createPlan, deletePlan, updatePlan } from "../../services/planService"
import type { MembershipPlan, PlanBody } from "../../types/payment"
import { errorText } from "../../utils/member"
import { formatMoney } from "../../utils/payment"

// One plan: its price and length, with Edit, Retire (or Offer again) and Delete.
function PlanItem({ plan, onSaved }: { plan: MembershipPlan; onSaved: () => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError("")
    try {
      await action()
      setEditing(false)
      await onSaved()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  if (editing)
    return (
      <li className="class-item">
        <PlanForm
          plan={plan}
          saving={busy}
          error={error}
          onSave={(body) => run(() => updatePlan(plan.plan, body))}
          onCancel={() => {
            setEditing(false)
            setError("")
          }}
        />
      </li>
    )

  return (
    <li className="class-item">
      <div className="toolbar">
        <h3 className="wrap-text">
          {plan.name} {!plan.is_active && <span className="pill neutral">Retired</span>}
        </h3>
        <strong>
          {formatMoney(plan.price)} <span className="hint">for {plan.duration_days} days</span>
        </strong>
      </div>
      {plan.description && <p className="wrap-text">{plan.description}</p>}
      <div className="actions">
        <button type="button" onClick={() => setEditing(true)} disabled={busy}>
          Edit
        </button>
        <button type="button" onClick={() => run(() => updatePlan(plan.plan, { is_active: !plan.is_active }))} disabled={busy}>
          {plan.is_active ? "Retire" : "Offer again"}
        </button>
        <button type="button" className="danger" onClick={() => run(() => deletePlan(plan.plan))} disabled={busy}>
          Delete
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </li>
  )
}

// Admins only: the membership plans the gym sells.
export default function PlansPage() {
  const { plans, reload } = usePlans()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  // Changing this remounts the add form, which clears it after a plan is added.
  const [formKey, setFormKey] = useState(0)

  async function add(body: PlanBody) {
    setSaving(true)
    setError("")
    try {
      await createPlan(body)
      setFormKey((k) => k + 1)
      await reload()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="column narrow-wide">
      <section className="card" aria-labelledby="plans-heading">
        <h2 id="plans-heading">Membership plans</h2>
        <p className="hint">
          The price fills in the amount when staff take a payment; the days decide how far a new membership or a renewal
          runs. Payments already taken are not changed. Retire a plan to stop selling it: members who have it keep it. Only a plan nobody ever had can be deleted.
        </p>
        {plans.length === 0 ? (
          <p className="empty">No plans yet. Add the first one below.</p>
        ) : (
          <ul className="class-list">
            {plans.map((p) => (
              <PlanItem key={p.plan} plan={p} onSaved={reload} />
            ))}
          </ul>
        )}
      </section>
      <section className="card" aria-labelledby="add-plan-heading">
        <h2 id="add-plan-heading">Add a plan</h2>
        <PlanForm key={formKey} saving={saving} error={error} onSave={add} />
      </section>
    </div>
  )
}
