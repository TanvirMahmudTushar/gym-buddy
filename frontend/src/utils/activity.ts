// Display helpers for the activity log and the security view.
import type { ActivityEvent, ActivityFilters } from "../types/activity"
import { pageLink } from "./hash"

/** Every event, in the order the filter lists them, with how it is shown. Red can mean an attack; blue is staff acting
 * on someone else's account or data; the rest is everyday. */
export const EVENTS: { value: ActivityEvent; label: string; look?: "bad" | "info" }[] = [
  { value: "login", label: "Login" },
  { value: "login_failed", label: "Failed login", look: "bad" },
  { value: "account_locked", label: "Account locked", look: "bad" },
  { value: "logout", label: "Logout" },
  { value: "session_revoke", label: "Session ended" },
  { value: "password_change", label: "Password changed" },
  { value: "password_change_failed", label: "Failed password change", look: "bad" },
  { value: "password_reset", label: "Password reset", look: "info" },
  { value: "signup", label: "Sign up" },
  { value: "role_change", label: "Role changed", look: "info" },
  { value: "ban", label: "Ban", look: "info" },
  { value: "unban", label: "Unban", look: "info" },
  { value: "account_delete", label: "Account deleted", look: "info" },
  { value: "workout_delete", label: "Workout deleted", look: "info" },
  { value: "group_delete", label: "Group deleted", look: "info" },
  { value: "class_delete", label: "Class deleted", look: "info" },
  { value: "equipment_delete", label: "Equipment deleted", look: "info" },
  { value: "announcement_delete", label: "Announcement deleted", look: "info" },
  { value: "plan_delete", label: "Plan deleted", look: "info" },
  { value: "expense_delete", label: "Expense deleted", look: "info" },
  { value: "payment_void", label: "Payment voided", look: "info" },
  { value: "export", label: "Export", look: "info" },
]

const info = (event: ActivityEvent) => EVENTS.find((e) => e.value === event)

export const eventLabel = (event: ActivityEvent) => info(event)?.label ?? event

export const eventPill = (event: ActivityEvent) => `pill ${info(event)?.look ?? ""}`

/** As many failed logins as it takes to lock one account (backend MAX_FAILED_LOGINS): the Security page flags them. */
export const FAILED_LOGIN_ALERT = 5

export const NO_ACTIVITY_FILTERS: ActivityFilters = { event: "", user_id: null, date_from: "", date_to: "", q: "" }

/** The address of the Activity page with these filters, such as #/activity?event=login_failed&q=192.0.2.66. */
export const activityLink = (f: Partial<ActivityFilters>) =>
  pageLink("activity", { event: f.event, user: f.user_id, from: f.date_from, to: f.date_to, q: f.q })
