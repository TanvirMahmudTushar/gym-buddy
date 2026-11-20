// Account types matching the FastAPI schemas (TDD 5.3).
import type { Plan } from "./member"

export type Role = "user" | "gym_manager" | "admin"

export interface User {
  id: number
  email: string
  name: string
  role: Role
  created_at: string
}

export interface LoginResult {
  access_token: string
  token_type: "bearer"
  user: User
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
export interface AccountPage {
  items: User[]
  total: number
  offset: number
  limit: number
}

export interface AdminUserPage {
  items: AdminUser[]
  total: number
  offset: number
  limit: number
}

export interface AdminStats {
  members: { total: number; active: number; expired: number; frozen: number; new_last_7_days: number; expiring_soon: number }
  users: { total: number; users: number; gym_managers: number; admins: number; banned: number }
  check_ins: { today: number; last_7_days: number }
  classes: { total: number; upcoming: number }
}
