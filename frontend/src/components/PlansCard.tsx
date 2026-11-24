import { usePlans } from "../context/PlansContext"
import type { Plan } from "../types/member"
import { formatMoney } from "../utils/payment"

// What the gym's plans cost, on the member's own page. Payment happens at the front desk (there is no online payment).
export default function PlansCard({ currentPlan }: { currentPlan?: Plan }) {
  const { offered } = usePlans()

  return (
    <section className="card" aria-labelledby="plans-heading">
      <h2 id="plans-heading">Plans and prices</h2>
      <ul className="visit-list">
        {offered.map((p) => (
          <li key={p.plan}>
            <span className="wrap-text">
              <strong>{p.name}</strong> <span className="hint">· {p.duration_days} days</span>
              {p.plan === currentPlan && <span className="pill active plan-current">Your plan</span>}
              {p.description && <div className="hint">{p.description}</div>}
            </span>
            <strong>{formatMoney(p.price)}</strong>
          </li>
        ))}
      </ul>
      <p className="hint">
        {currentPlan
          ? "To renew, pay at the front desk. The plan's days are added to your expiry date, or to today if it has already passed, so no paid days are lost."
          : "Pick a plan and pay at the front desk to start your membership."}
      </p>
    </section>
  )
}
