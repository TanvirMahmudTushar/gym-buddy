// Small display helpers for members.
import type { Member, MemberStatus } from "../types/member"

/** The options after ? in the address: #/members?filter=expiring_soon&member=5. */
export const hashParams = () => new URLSearchParams(window.location.hash.split("?")[1] ?? "")

/** The address of the Members page, opened on a filter and/or a member. Anything can link to a member with it. */
export function membersLink(options: { filter?: string; member?: number | null } = {}): string {
  const params = new URLSearchParams()
  if (options.filter && options.filter !== "all") params.set("filter", options.filter)
  if (options.member != null) params.set("member", String(options.member))
  const query = params.toString()
  return query ? `#/members?${query}` : "#/members"
}

/** Today as YYYY-MM-DD in UTC, the same "today" the backend uses for expiry. */
export const todayUtc = () => new Date().toISOString().slice(0, 10)

/** Frozen wins over expired, matching the backend's status filter. */
export function memberStatus(member: Pick<Member, "is_frozen" | "expires_on">): MemberStatus {
  if (member.is_frozen) return "frozen"
  return member.expires_on < todayUtc() ? "expired" : "active"
}

/** "today", "tomorrow" or "in 5 days" for an active membership ending within 7 days; otherwise null. */
export function expiresSoonNote(member: Member): string | null {
  if (member.is_frozen) return null
  const days = Math.round((Date.parse(member.expires_on) - Date.parse(todayUtc())) / 86_400_000)
  if (days < 0 || days > 7) return null
  return days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`
}

export function formatDate(isoDate: string): string {
  return new Date(`${isoDate.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

export const formatTime = (isoDateTime: string) =>
  new Date(isoDateTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })

export const formatDateTime = (isoDateTime: string) =>
  new Date(isoDateTime).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

export const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong")
