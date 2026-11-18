// Role names and what each role may open.
import type { Role } from "../types/auth"

export const ROLES: { value: Role; label: string; description: string }[] = [
  { value: "user", label: "User", description: "Can log in and manage their own account." },
  { value: "gym_manager", label: "Gym Manager", description: "Manages gym members: add, edit, renew, freeze and delete." },
  { value: "admin", label: "Admin", description: "Everything a Gym Manager can do, plus managing users and roles." },
]

export const roleLabel = (role: Role) => ROLES.find((r) => r.value === role)?.label ?? role

export type Page = "login" | "signup" | "dashboard" | "members" | "classes" | "account" | "users"
export type ProtectedPage = "dashboard" | "members" | "classes" | "account" | "users"

/** Pages that need a login, and the roles allowed to open them. */
const ALLOWED: Record<ProtectedPage, Role[]> = {
  dashboard: ["admin"],
  members: ["gym_manager", "admin"],
  classes: ["gym_manager", "admin"],
  account: ["user", "gym_manager", "admin"],
  users: ["admin"],
}

export const canOpen = (role: Role, page: ProtectedPage) => ALLOWED[page].includes(role)

/** Where a person lands after logging in. */
export const homePage = (role: Role): ProtectedPage => (role === "admin" ? "dashboard" : canOpen(role, "members") ? "members" : "account")
