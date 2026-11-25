// Activity log and security view types, matching the FastAPI schemas (TDD 5.3).
import type { Page } from "./page"

/** The event names from backend/app/models.py (ActivityEvent). */
export type ActivityEvent =
  | "signup"
  | "login"
  | "login_failed"
  | "account_locked"
  | "logout"
  | "password_change"
  | "password_change_failed"
  | "password_reset"
  | "role_change"
  | "ban"
  | "unban"
  | "session_revoke"
  | "account_delete"
  | "export"
  | "expense_delete"
  | "workout_delete"
  | "group_delete"
  | "class_delete"
  | "equipment_delete"
  | "announcement_delete"
  | "plan_delete"
  | "payment_void"
  | "group_member_remove"
  | "booking_cancel"

/** One security event: who did it, to which account, from where and when. */
export interface ActivityEntry {
  id: number
  created_at: string
  event: ActivityEvent
  /** null when no account did it: an email with no account on a failed login, or the server itself. */
  actor_id: number | null
  /** On a failed login, the email that was typed. Kept after the account is deleted. */
  actor_email: string | null
  /** The account acted on, when it is not the actor's own. */
  target_id: number | null
  target_email: string | null
  details: string | null
  ip: string | null
  user_agent: string | null
}

export type ActivityPage = Page<ActivityEntry>

/** The filter form. Empty text means "any"; dates are days at the gym, both included. */
export interface ActivityFilters {
  event: ActivityEvent | ""
  /** Rows where this account acted or was acted on. */
  user_id: number | null
  date_from: string
  date_to: string
  /** Part of an email, the IP address or the details. */
  q: string
}

export interface FailedLoginsByIp {
  /** null when the address was not known. */
  ip: string | null
  count: number
  /** How many different emails were tried from this address. */
  accounts: number
  last_at: string
}

export interface FailedLoginsByAccount {
  email: string
  /** null when no account has this email. */
  user_id: number | null
  count: number
  /** From how many different addresses. */
  ips: number
  last_at: string
}

/** Failed logins since `since`: the 10 addresses and 10 accounts with the most. */
export interface FailedLoginWindow {
  since: string
  total: number
  lockouts: number
  by_ip: FailedLoginsByIp[]
  by_account: FailedLoginsByAccount[]
}

export interface SecuritySummary {
  last_24_hours: FailedLoginWindow
  last_7_days: FailedLoginWindow
}
