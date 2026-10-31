// Member types matching the FastAPI schemas (TDD 5.3), plus small display helpers.
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

export interface MemberCreate {
  full_name: string
  phone: string | null
  plan: Plan
  expires_on: string
  notes: string | null
}

export const PLANS: { value: Plan; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
]

export const planLabel = (plan: Plan) => PLANS.find((p) => p.value === plan)?.label ?? plan

/** Today as YYYY-MM-DD in UTC, the same "today" the backend uses for expiry. */
export const todayUtc = () => new Date().toISOString().slice(0, 10)

/** Frozen wins over expired, matching the backend's status filter. */
export function memberStatus(member: Member): MemberStatus {
  if (!member.is_active) return "frozen"
  return member.expires_on < todayUtc() ? "expired" : "active"
}

export function formatDate(isoDate: string): string {
  return new Date(`${isoDate.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

export const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong")
