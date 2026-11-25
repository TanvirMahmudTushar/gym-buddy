// Small display helpers for members.
import type { Member, MemberStatus } from "../types/member"
import { pageLink } from "./hash"
import { daysBetween, gymToday } from "./time"

/** The address of the Members page, opened on a filter or on one member. Anything can link to a member with it. */
export const membersLink = (options: { filter?: string; member?: number | null } = {}) =>
  pageLink("members", { filter: options.filter === "all" ? null : options.filter, member: options.member })

/** Frozen wins over expired, matching the backend's status filter. */
export function memberStatus(member: Pick<Member, "is_frozen" | "expires_on">): MemberStatus {
  if (member.is_frozen) return "frozen"
  return member.expires_on < gymToday() ? "expired" : "active"
}

/** "ends today", "ends tomorrow" or "5 days left" for an active membership ending within 7 days; otherwise null. */
export function expiresSoonNote(member: Pick<Member, "is_frozen" | "expires_on">): string | null {
  if (member.is_frozen) return null
  const days = daysBetween(gymToday(), member.expires_on)
  if (days < 0 || days > 7) return null
  return days === 0 ? "ends today" : days === 1 ? "ends tomorrow" : `${days} days left`
}
