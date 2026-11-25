// Account types matching the FastAPI schemas (TDD 5.3).
import type { ActivityEntry } from "./activity"
import type { CheckIn } from "./checkIn"
import type { BookedClass } from "./gymClass"
import type { Plan } from "./member"
import type { Payment } from "./payment"
import type { Workout } from "./workout"
import type { Page } from "./page"

export type Role = "user" | "trainer" | "gym_manager" | "admin"

/** The permission names from backend/app/rbac.py. Which role holds which is decided only by the server. */
export type Permission =
  | "members:read"
  | "members:manage"
  | "members:delete"
  | "check_ins:record"
  | "payments:manage"
  | "payments:void"
  | "payments:export"
  | "classes:manage"
  | "classes:teach"
  | "clients:read"
  | "groups:create"
  | "equipment:read"
  | "equipment:manage"
  | "expenses:manage"
  | "overview:read"
  | "announcements:manage"
  | "dashboard:read"
  | "users:read"
  | "users:change_role"
  | "users:ban"
  | "users:reset_password"
  | "users:revoke_sessions"
  | "users:export"
  | "plans:edit"
  | "activity:read"
  | "content:moderate"

/** An account as other screens see it (lists, the admin's user table). */
export interface User {
  id: number
  email: string
  name: string
  role: Role
  created_at: string
  /** True after an admin reset the password: the app shows only Choose a new password until it is changed. */
  must_change_password: boolean
}

/** The logged-in user (GET /users/me, login, refresh): their account plus what their role may do. */
export interface Me extends User {
  permissions: Permission[]
  /** The membership plan, or null while this account has no membership. */
  plan: Plan | null
}

/** Log in and refresh. The refresh token is not here: it stays in an HttpOnly cookie the page cannot read. */
export interface LoginResult {
  access_token: string
  token_type: "bearer"
  /** Seconds until the access token expires (15 minutes). */
  expires_in: number
  user: Me
}

/** A browser where I am logged in. */
export interface SessionInfo {
  id: number
  created_at: string
  last_used_at: string
  expires_at: string
  ip: string | null
  user_agent: string | null
  /** True for this browser. */
  current: boolean
}

export interface SignupBody {
  email: string
  name: string
  password: string
}

/** What an admin sees about a user: the ban status and their membership as well. */
export interface AdminUser extends User {
  is_banned: boolean
  banned_at: string | null
  ban_reason: string | null
  /** null for an account without a membership. */
  plan: Plan | null
  expires_on: string | null
  is_frozen: boolean
}

/** A page of accounts, such as the ones waiting for a membership. */
export type AccountPage = Page<User>

/** After an admin resets a password: the account and the temporary password, shown only this once. */
export interface PasswordResetResult {
  user: AdminUser
  temporary_password: string
}

export type AdminUserPage = Page<AdminUser>

export interface AdminStats {
  members: { total: number; active: number; expired: number; frozen: number; new_last_7_days: number; expiring_soon: number }
  users: { total: number; users: number; trainers: number; gym_managers: number; admins: number; banned: number; new_last_7_days: number }
  /** by_day: each of the last 7 days, oldest first. */
  check_ins: { today: number; last_7_days: number; inside_now: number; by_day: { day: string; count: number }[] }
  classes: { total: number; upcoming: number }
  workouts: { total: number; last_7_days: number; completed: number }
  groups: { total: number; new_last_7_days: number }
  equipment: { total: number; needs_attention: number; service_due: number }
}

/** The admin user list's filters; the CSV export uses the same ones. Empty means any. */
export interface UserFilters {
  q: string
  role: Role | ""
  status: "active" | "banned" | ""
}

/** An id a bulk ban or unban left alone, and why. name is null when no account has the id. */
export interface SkippedUser {
  id: number
  name: string | null
  reason: string
}

export interface BulkBanResult {
  banned: number[]
  skipped: SkippedUser[]
}

export interface BulkUnbanResult {
  unbanned: number[]
  skipped: SkippedUser[]
}

/** One of a user's active logins, as an admin sees it. */
export interface AdminSession {
  id: number
  created_at: string
  last_used_at: string
  expires_at: string
  ip: string | null
  user_agent: string | null
}

/** GET /admin/users/{id}: the account and membership, logins, records, groups and activity. */
export interface AdminUserDetail extends AdminUser {
  joined_on: string | null
  /** Set while too many wrong passwords block the account's logins. */
  locked_until: string | null
  /** null: never changed since signing up. */
  password_changed_at: string | null
  sessions: AdminSession[]
  records: {
    visits: number
    bookings: number
    payments: number
    workouts_added: number
    workouts_assigned: number
    workouts_completed: number
  }
  /** The newest of each kind (5 of each). */
  recent_records: { workouts: Workout[]; bookings: BookedClass[]; visits: CheckIn[]; payments: Payment[] }
  groups: { id: number; name: string; is_owner: boolean; member_count: number }[]
  recent_activity: ActivityEntry[]
}
