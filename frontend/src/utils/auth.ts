// Role names and what each role may open.
import type { Role } from "../types/auth"

export const ROLES: { value: Role; label: string; description: string }[] = [
  { value: "user", label: "User", description: "Can log in and manage their own account." },
  { value: "gym_manager", label: "Gym Manager", description: "Manages gym members: add, edit, renew, freeze and delete." },
  { value: "admin", label: "Admin", description: "Everything a Gym Manager can do, plus managing users and roles." },
]

export const roleLabel = (role: Role) => ROLES.find((r) => r.value === role)?.label ?? role

export type Page = "login" | "signup" | "members" | "account" | "users"

/** Pages that need a login, and the roles allowed to open them. */
const ALLOWED: Record<"members" | "account" | "users", Role[]> = {
  members: ["gym_manager", "admin"],
  account: ["user", "gym_manager", "admin"],
  users: ["admin"],
}

export const canOpen = (role: Role, page: "members" | "account" | "users") => ALLOWED[page].includes(role)

/** Where a person lands after logging in. */
export const homePage = (role: Role): "members" | "account" => (canOpen(role, "members") ? "members" : "account")
