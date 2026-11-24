// Helpers for workouts and training groups. Buttons follow the permissions the server sends (my_permissions);
// the API checks the same permissions on every request (backend/app/rbac.py, GroupPermission).
import type { Group, GroupPermission, MemberFlag } from "../types/workout"
import { todayUtc } from "./member"

/** True when I hold this permission in the group. */
export const canInGroup = (group: Group | null, permission: GroupPermission) => group?.my_permissions.includes(permission) ?? false

/** The three permissions the owner ticks for each member, with how the members table names them. */
export const MEMBER_FLAGS: { flag: MemberFlag; label: string; description: string }[] = [
  { flag: "can_create", label: "Add", description: "Add workouts to the group" },
  { flag: "can_update", label: "Edit", description: "Edit and delete the group's workouts" },
  { flag: "can_assign", label: "Assign", description: "Assign workouts to people in the group" },
]

export type TrainingTab = "assigned" | "groups" | "all-groups" | "all-workouts"

/** The address of the Training page, on one of its tabs: #/training?tab=groups. */
export function trainingLink(tab: TrainingTab, owner: number | null = null): string {
  const params = new URLSearchParams({ tab })
  if (owner) params.set("owner", String(owner))
  return `#/training?${params}`
}

/** The address of the Training page, opened on one group: #/training?group=5. */
export const groupLink = (id: number | null) => (id === null ? trainingLink("groups") : `#/training?group=${id}`)

/** The furthest ahead a workout can be planned (the API allows a year from today). */
export function latestWorkoutDate(): string {
  const d = new Date(`${todayUtc()}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 365)
  return d.toISOString().slice(0, 10)
}

export const EARLIEST_WORKOUT_DATE = "2000-01-01"
