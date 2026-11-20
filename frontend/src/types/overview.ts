// The Gym Manager's start page, matching the FastAPI schema (TDD 5.3).
import type { GymClass } from "./gymClass"

export interface Overview {
  check_ins_today: number
  /** Active memberships ending today or within 7 days (the Members page's Expiring soon filter). */
  expiring_soon: number
  /** User accounts with no membership yet (the Members page's waiting list). */
  waiting: number
  /** Payments since midnight UTC that are not voided. */
  payments_today: { count: number; amount: number }
  /** The next classes that have not started yet, soonest first. */
  next_classes: GymClass[]
}
