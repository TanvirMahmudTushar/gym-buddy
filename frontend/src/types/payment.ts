// Plan and payment types matching the FastAPI schemas (TDD 5.3).
import type { Plan } from "./member"

export type PaymentMethod = "cash" | "card" | "bank_transfer" | "mobile_banking"

/** A membership plan the gym sells. A retired one (is_active false) cannot be chosen any more. */
export interface MembershipPlan {
  plan: Plan
  name: string
  price: number
  duration_days: number
  description: string | null
  is_active: boolean
}

export interface PlanBody {
  name: string
  price: number
  duration_days: number
  description: string | null
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
  /** Set when an admin voided the payment: it stays on record but is left out of every total. */
  voided_at: string | null
  void_reason: string | null
  voided_by_name: string | null
}

export interface PaymentPage {
  items: Payment[]
  total: number
  offset: number
  limit: number
}

/** The all-payments list: total_amount adds up every matching payment that is not voided, not just this page. */
export interface PaymentListPage extends PaymentPage {
  total_amount: number
}

/** Filters for the payments list and the CSV export. Empty strings mean "any". Dates are YYYY-MM-DD (UTC). */
export interface PaymentFilters {
  date_from: string
  date_to: string
  method: PaymentMethod | ""
  member: string
  include_voided: boolean
}

/** Money taken, by UTC calendar day; voided payments are never counted. */
export interface RevenueStats {
  today: number
  this_month: number
  expenses_this_month: number
  /** This month's payments minus its expenses. */
  net_this_month: number
  /** The last 30 days, today included, starting on last_30_days_from (YYYY-MM-DD). */
  last_30_days: number
  last_30_days_from: string
  /** The last 30 days by method: all four methods, zero when unused. */
  by_method: { method: PaymentMethod; amount: number; count: number }[]
  /** The last 6 months, oldest first, as YYYY-MM; the last is this month so far. */
  months: { month: string; amount: number; expenses: number; net: number }[]
}

export interface PaymentBody {
  amount: number
  method: PaymentMethod
  note: string | null
  /** Set to extend the membership by this plan's days in the same step. */
  renew_plan: Plan | null
}
