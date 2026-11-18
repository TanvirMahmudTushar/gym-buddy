// Plan and payment types matching the FastAPI schemas (TDD 5.3).
import type { Plan } from "./member"

export type PaymentMethod = "cash" | "card" | "bank_transfer" | "mobile_banking"

export interface PlanPrice {
  plan: Plan
  price: number
  duration_days: number
}

export interface Payment {
  id: number
  /** null once the member has been deleted; the payment stays on record. */
  member_id: number | null
  member_name: string
  amount: number
  method: PaymentMethod
  plan: Plan | null
  note: string | null
  paid_at: string
  renewed_until: string | null
  recorded_by_name: string | null
}

export interface PaymentPage {
  items: Payment[]
  total: number
  offset: number
  limit: number
}

export interface PaymentBody {
  amount: number
  method: PaymentMethod
  note: string | null
  /** Set to extend the membership by this plan's days in the same step. */
  renew_plan: Plan | null
}
