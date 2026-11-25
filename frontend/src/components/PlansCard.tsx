import { usePlans } from "../context/PlansContext"
import type { Plan } from "../types/member"
import { formatMoney } from "../utils/payment"

// What the gym's plans cost, on the member's own page. Payment happens at the front desk (there is no online payment).
export default function PlansCard({ currentPlan }: { currentPlan?: Plan }) {
  const { offered } = usePlans()

  return (
    <section className="card">
      <h2>Plans and prices</h2>
      <ul className="rows">
        {offered.map((p) => (
          <li key={p.plan}>
            <span>
              <span className="row-title">
                {p.name} {p.plan === currentPlan && <span className="pill good">Your plan</span>}
              </span>
              <span className="hint">
                {p.duration_days} days{p.description ? ` · ${p.description}` : ""}
              </span>
            </span>
            <strong>{formatMoney(p.price)}</strong>
          </li>
        ))}
      </ul>
      <p className="hint">
        {currentPlan
          ? "Renew at the front desk. The plan's days are added to your expiry date, so no paid days are lost."
          : "Pick a plan and pay at the front desk to start your membership."}
      </p>
    </section>
  )
}
