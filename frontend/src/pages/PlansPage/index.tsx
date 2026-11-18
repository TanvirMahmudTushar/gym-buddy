import { type FormEvent, useEffect, useState } from "react"
import { updatePlan } from "../../services/adminService"
import { listPlans } from "../../services/paymentService"
import type { PlanPrice } from "../../types/payment"
import { errorText, planLabel } from "../../utils/member"
import { formatMoney } from "../../utils/payment"

// One plan: its price and the number of days a renewal adds, with its own Save.
function PlanRow({ plan, onSaved }: { plan: PlanPrice; onSaved: (saved: PlanPrice) => void }) {
  const [price, setPrice] = useState(String(plan.price))
  const [days, setDays] = useState(String(plan.duration_days))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)

  const changed = price !== String(plan.price) || days !== String(plan.duration_days)
  const id = `plan-${plan.plan}`

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaved(false)
    const p = Number(price)
    const d = Number(days)
    if (!Number.isInteger(p) || p < 1 || p > 10_000_000) return setError("The price must be a whole number from 1 to 10,000,000.")
    if (!Number.isInteger(d) || d < 1 || d > 3660) return setError("The length must be a whole number of days from 1 to 3,660.")
    setBusy(true)
    setError("")
    try {
      onSaved(await updatePlan(plan.plan, { price: p, duration_days: d }))
      setSaved(true)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="class-item">
      <form className="inline" onSubmit={handleSubmit} noValidate>
        <h3 className="plan-name">{planLabel(plan.plan)}</h3>
        <div className="field">
          <label htmlFor={`${id}-price`}>Price (৳)</label>
          <input id={`${id}-price`} type="number" min={1} step={1} inputMode="numeric" value={price} onChange={(e) => { setPrice(e.target.value); setSaved(false) }} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-days`}>Days a renewal adds</label>
          <input id={`${id}-days`} type="number" min={1} step={1} inputMode="numeric" value={days} onChange={(e) => { setDays(e.target.value); setSaved(false) }} />
        </div>
        <button type="submit" className="primary" disabled={busy || !changed}>
          {busy ? "Saving…" : "Save"}
        </button>
      </form>
      {saved && (
        <p className="hint" role="status">
          Saved: {formatMoney(plan.price)} for {plan.duration_days} days.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </li>
  )
}

// Admins only: the price and length of the three membership plans. They fill in the amount when taking a payment
// and decide how far a renewal extends the expiry.
export default function PlansPage() {
  const [plans, setPlans] = useState<PlanPrice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let ignore = false
    listPlans()
      .then((p) => !ignore && setPlans(p))
      .catch((err) => !ignore && setError(errorText(err)))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [])

  const handleSaved = (saved: PlanPrice) => setPlans((prev) => prev.map((p) => (p.plan === saved.plan ? saved : p)))

  return (
    <section className="card narrow-wide" aria-labelledby="plans-heading">
      <h2 id="plans-heading">Plans and prices</h2>
      <p className="hint">
        The price fills in the amount when staff take a payment. The days decide how far a renewal extends a
        membership. Payments already taken are not changed.
      </p>
      {loading && <p className="empty">Loading plans…</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <ul className="class-list">
        {plans.map((p) => (
          <PlanRow key={p.plan} plan={p} onSaved={handleSaved} />
        ))}
      </ul>
    </section>
  )
}
