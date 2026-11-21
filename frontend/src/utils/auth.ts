// Role names and what each role may open.
import type { Role } from "../types/auth"

export const ROLES: { value: Role; label: string; description: string }[] = [
  { value: "user", label: "User", description: "A gym member: sees their own membership and books classes." },
  { value: "trainer", label: "Trainer", description: "Teaches classes: sees the classes they teach and who booked each one." },
  { value: "gym_manager", label: "Gym Manager", description: "Manages memberships: start, edit, renew and freeze them, and delete member accounts." },
  { value: "admin", label: "Admin", description: "Everything a Gym Manager can do, plus managing users and roles." },
]

export const roleLabel = (role: Role) => ROLES.find((r) => r.value === role)?.label ?? role

export type Page = "login" | "signup" | ProtectedPage
export type ProtectedPage =
  | "dashboard"
  | "overview"
  | "members"
  | "classes"
  | "payments"
  | "announcements"
  | "membership"
  | "timetable"
  | "my-classes"
  | "plans"
  | "account"
  | "users"

/** Pages that need a login, and the roles allowed to open them. */
const ALLOWED: Record<ProtectedPage, Role[]> = {
  dashboard: ["admin"],
  overview: ["gym_manager", "admin"],
  members: ["gym_manager", "admin"],
  classes: ["gym_manager", "admin"],
  payments: ["gym_manager", "admin"],
  announcements: ["gym_manager", "admin"],
  membership: ["user"],
  timetable: ["user"],
  "my-classes": ["trainer"],
  plans: ["admin"],
  account: ["user", "trainer", "gym_manager", "admin"],
  users: ["admin"],
}

export const canOpen = (role: Role, page: ProtectedPage) => ALLOWED[page].includes(role)

/** Where a person lands after logging in. */
const HOME: Record<Role, ProtectedPage> = { admin: "dashboard", gym_manager: "overview", trainer: "my-classes", user: "membership" }
export const homePage = (role: Role): ProtectedPage => HOME[role]
