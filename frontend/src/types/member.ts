// Member types matching the FastAPI schemas (TDD 5.3). A member is a user whose account has a membership.
export type Plan = "monthly" | "quarterly" | "yearly"
export type MemberStatus = "active" | "expired" | "frozen"

export interface Member {
  /** The user's id: members and users are the same accounts. */
  id: number
  name: string
  email: string
  phone: string | null
  plan: Plan
  joined_on: string
  expires_on: string
  is_frozen: boolean
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
  expires_on: string
  notes: string | null
}

/** PATCH body: only the fields sent change. */
export type MemberUpdate = Partial<Pick<Member, "name" | "phone" | "plan" | "expires_on" | "is_frozen" | "notes">>

export interface MemberBulkDeleteResult {
  deleted: number
}
