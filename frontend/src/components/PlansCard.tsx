import { useEffect, useState } from "react"
import { listPlans } from "../services/paymentService"
import type { Plan } from "../types/member"
import type { PlanPrice } from "../types/payment"
import { errorText, planLabel } from "../utils/member"
import { formatMoney } from "../utils/payment"

// What renewing costs, on the member's own page. Payment happens at the front desk (there is no online payment).
export default function PlansCard({ currentPlan }: { currentPlan: Plan }) {
  const [plans, setPlans] = useState<PlanPrice[]>([])
  const [error, setError] = useState("")

  useEffect(() => {
    let ignore = false
    listPlans()
      .then((p) => !ignore && setPlans(p))
      .catch((err) => !ignore && setError(errorText(err)))
    return () => {
      ignore = true
    }
  }, [])

  return (
    <section className="card" aria-labelledby="plans-heading">
      <h2 id="plans-heading">Plans and prices</h2>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <ul className="visit-list">
        {plans.map((p) => (
          <li key={p.plan}>
            <span>
              <strong>{planLabel(p.plan)}</strong> <span className="hint">· {p.duration_days} days</span>
              {p.plan === currentPlan && <span className="pill active plan-current">Your plan</span>}
            </span>
            <strong>{formatMoney(p.price)}</strong>
          </li>
        ))}
      </ul>
      <p className="hint">
        To renew, pay at the front desk. The plan's days are added to your expiry date, or to today if it has already
        passed, so no paid days are lost.
      </p>
    </section>
  )
}
