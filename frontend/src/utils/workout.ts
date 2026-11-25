// Helpers for workouts and training groups. Buttons follow the permissions the server sends (my_permissions);
// the API checks the same permissions on every request (backend/app/rbac.py, GroupPermission).
import type { Group, GroupPermission, MemberFlag, WorkoutStatus } from "../types/workout"
import { pageLink } from "./hash"
import { addDays, gymToday } from "./time"

/** True when I hold this permission in the group. */
export const canInGroup = (group: Group | null, permission: GroupPermission) => group?.my_permissions.includes(permission) ?? false

/** The three permissions the owner ticks for each member, with how the members table names them. */
export const MEMBER_FLAGS: { flag: MemberFlag; label: string; description: string }[] = [
  { flag: "can_create", label: "Add", description: "Add workouts to the group" },
  { flag: "can_update", label: "Edit", description: "Edit and delete the group's workouts" },
  { flag: "can_assign", label: "Assign", description: "Assign workouts to people in the group" },
]

/** What I may do in a group, in a few words: "Owner", "View, add and assign". */
export function myAccess(group: Group): string {
  if (canInGroup(group, "manage")) return "Owner"
  const can = ["view", canInGroup(group, "create") && "add", canInGroup(group, "update") && "edit", canInGroup(group, "assign") && "assign"].filter(Boolean)
  if (can.length === 1) return "View only"
  const text = `${can.slice(0, -1).join(", ")} and ${can[can.length - 1]}`
  return text[0].toUpperCase() + text.slice(1)
}

export const WORKOUT_STATUSES: { value: WorkoutStatus; label: string }[] = [
  { value: "unassigned", label: "Not assigned" },
  { value: "to_do", label: "To do" },
  { value: "done", label: "Done" },
]

export type TrainingTab = "assigned" | "groups" | "all-groups" | "all-workouts"

/** The address of the Training page, on one of its tabs: #/training?tab=groups. */
export const trainingLink = (tab: TrainingTab, options: { owner?: number | null; group_id?: number | null } = {}) =>
  pageLink("training", { tab, ...options })

/** The address of the Training page, opened on one group: #/training?group=5. */
export const groupLink = (id: number) => pageLink("training", { group: id })

/** The furthest ahead a workout can be planned (the API allows a year from today). */
export const latestWorkoutDate = () => addDays(gymToday(), 365)

export const EARLIEST_WORKOUT_DATE = "2000-01-01"
