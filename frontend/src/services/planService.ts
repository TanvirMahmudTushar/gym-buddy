// fetch helpers for membership plans: /api/v1/plans. Anyone logged in can read them; changing them is for admins.
import type { Plan } from "../types/member"
import type { MembershipPlan, PlanBody } from "../types/payment"
import { request } from "./api"

const BASE = "/api/v1/plans"

/** Every plan, cheapest first, retired ones included (older members and payments still show their names). */
export const listPlans = () => request<MembershipPlan[]>(BASE)

export const createPlan = (body: PlanBody) => request<MembershipPlan>(BASE, { method: "POST", body: JSON.stringify(body) })

/** Only the fields sent change; is_active false retires the plan. */
export const updatePlan = (plan: Plan, changes: Partial<PlanBody & { is_active: boolean }>) =>
  request<MembershipPlan>(`${BASE}/${encodeURIComponent(plan)}`, { method: "PATCH", body: JSON.stringify(changes) })

/** Only a plan no member or payment has (409 otherwise). */
export const deletePlan = (plan: Plan) => request<void>(`${BASE}/${encodeURIComponent(plan)}`, { method: "DELETE" })
