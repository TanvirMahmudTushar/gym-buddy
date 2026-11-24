import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { listPlans } from "../services/planService"
import type { Plan } from "../types/member"
import type { MembershipPlan } from "../types/payment"
import { useAuth } from "./AuthContext"

interface PlansValue {
  /** Every plan, retired ones included, cheapest first. */
  plans: MembershipPlan[]
  /** The plans that can be chosen now. */
  offered: MembershipPlan[]
  /** The plan's current name, for a member or a payment that holds its code. */
  planLabel: (plan: Plan) => string
  /** Load the list again, after an admin changed a plan. */
  reload: () => Promise<void>
}

const PlansContext = createContext<PlansValue | null>(null)

// The gym's plans, loaded once after logging in: many pages show a plan's name, and the forms offer them.
export function PlansProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [plans, setPlans] = useState<MembershipPlan[]>([])
  // Until a new password is chosen the API refuses everything else, so there is nothing to load yet.
  const ready = user !== null && !user.must_change_password

  const reload = useCallback(async () => {
    setPlans(await listPlans())
  }, [])

  useEffect(() => {
    if (!ready) {
      setPlans([])
      return
    }
    // Without the names the pages show the plan codes ("monthly"), so a failure here needs no message of its own.
    reload().catch(() => undefined)
  }, [ready, reload])

  const value = useMemo<PlansValue>(
    () => ({
      plans,
      offered: plans.filter((p) => p.is_active),
      planLabel: (plan) => plans.find((p) => p.plan === plan)?.name ?? plan,
      reload,
    }),
    [plans, reload],
  )
  return <PlansContext.Provider value={value}>{children}</PlansContext.Provider>
}

export function usePlans(): PlansValue {
  const value = useContext(PlansContext)
  if (!value) throw new Error("usePlans must be used inside PlansProvider")
  return value
}
