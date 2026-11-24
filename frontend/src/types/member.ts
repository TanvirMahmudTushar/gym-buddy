// Member types matching the FastAPI schemas (TDD 5.3). A member is a user whose account has a membership.
import type { PaymentMethod } from "./payment"
import type { Profile } from "./profile"

/** A plan's code, such as "monthly". Its name and price come from the plan list (context/PlansContext.tsx). */
export type Plan = string
export type MemberStatus = "active" | "expired" | "frozen"
/** A member list filter: a status, or active memberships ending today or within the next 7 days. */
export type MemberFilter = MemberStatus | "expiring_soon"

/** The account's details and membership, plus its phone, date of birth and emergency contact (from Profile). */
export interface Member extends Profile {
  /** The user's id: members and users are the same accounts. */
  id: number
  name: string
  email: string
  plan: Plan
  joined_on: string
  expires_on: string
  is_frozen: boolean
  /** The personal trainer, if the member has one. */
  trainer_id: number | null
  trainer_name: string | null
  notes: string | null
}

export interface MemberPage {
  items: Member[]
  total: number
  offset: number
  limit: number
}

/** Start a membership on the account with this email (the person signs up first). */
export interface MemberCreate {
  email: string
  phone: string | null
  plan: Plan
  /** null: the membership runs for the plan's days. */
  expires_on: string | null
  trainer_id: number | null
  notes: string | null
  /** Set when they pay now: the plan's price is recorded in the same step. */
  payment_method: PaymentMethod | null
}

/** PATCH body: only the fields sent change. Staff edit the contact and safety details here too. */
export type MemberUpdate = Partial<Pick<Member, "name" | "plan" | "expires_on" | "is_frozen" | "trainer_id" | "notes"> & Profile>

export interface MemberBulkDeleteResult {
  deleted: number
}
