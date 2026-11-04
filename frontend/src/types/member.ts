// Member types matching the FastAPI schemas (TDD 5.3).
export type Plan = "monthly" | "quarterly" | "yearly"
export type MemberStatus = "active" | "expired" | "frozen"

export interface Member {
  id: number
  full_name: string
  phone: string | null
  plan: Plan
  joined_on: string
  expires_on: string
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface MemberPage {
  items: Member[]
  total: number
  offset: number
  limit: number
}

export interface MemberCreate {
  full_name: string
  phone: string | null
  plan: Plan
  expires_on: string
  notes: string | null
}

/** PATCH body: only the fields sent change. */
export type MemberUpdate = Partial<Pick<Member, "full_name" | "phone" | "plan" | "expires_on" | "is_active" | "notes">>
