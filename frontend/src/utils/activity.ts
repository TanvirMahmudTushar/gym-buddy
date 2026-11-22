// Display helpers for the activity log and the security view.
import type { ActivityEvent, ActivityFilters } from "../types/activity"

/** Every event, in the order the filter lists them, with how it is shown. */
export const EVENTS: { value: ActivityEvent; label: string }[] = [
  { value: "login", label: "Login" },
  { value: "login_failed", label: "Failed login" },
  { value: "account_locked", label: "Account locked" },
  { value: "logout", label: "Logout" },
  { value: "session_revoke", label: "Session ended" },
  { value: "password_change", label: "Password changed" },
  { value: "password_change_failed", label: "Failed password change" },
  { value: "password_reset", label: "Password reset" },
  { value: "signup", label: "Sign up" },
  { value: "role_change", label: "Role changed" },
  { value: "ban", label: "Ban" },
  { value: "unban", label: "Unban" },
  { value: "account_delete", label: "Account deleted" },
  { value: "export", label: "Export" },
  { value: "workout_delete", label: "Workout removed" },
  { value: "group_delete", label: "Group removed" },
]

export const eventLabel = (event: ActivityEvent) => EVENTS.find((e) => e.value === event)?.label ?? event

// Events that can mean an attack, and admin actions on someone else's account, get their own colour.
const WARNING: ActivityEvent[] = ["login_failed", "account_locked", "password_change_failed"]
const ADMIN_ACTION: ActivityEvent[] = [
  "role_change",
  "ban",
  "unban",
  "password_reset",
  "account_delete",
  "export",
  "workout_delete",
  "group_delete",
]

/** The pill class for an event: red for possible attacks, blue for admin actions, grey otherwise. */
export function eventPill(event: ActivityEvent): string {
  if (WARNING.includes(event)) return "pill banned"
  if (ADMIN_ACTION.includes(event)) return "pill frozen"
  return "pill neutral"
}

/** As many failed logins as it takes to lock one account (backend MAX_FAILED_LOGINS): the Security page flags them. */
export const FAILED_LOGIN_ALERT = 5

export const NO_ACTIVITY_FILTERS: ActivityFilters = { event: "", user_id: null, date_from: "", date_to: "", q: "" }

/** The address of the Activity page with these filters, such as #/activity?event=login_failed&q=192.0.2.66. */
export function activityLink(filters: Partial<ActivityFilters>): string {
  const params = new URLSearchParams()
  if (filters.event) params.set("event", filters.event)
  if (filters.user_id) params.set("user", String(filters.user_id))
  if (filters.date_from) params.set("from", filters.date_from)
  if (filters.date_to) params.set("to", filters.date_to)
  if (filters.q) params.set("q", filters.q)
  return params.toString() ? `#/activity?${params}` : "#/activity"
}
