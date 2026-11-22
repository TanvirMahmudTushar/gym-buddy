// Role names, and which pages a logged-in person may open. Page access follows the permissions the server sends
// (GET /users/me), so the menu always matches what the API allows. Hiding a page is not the security: the API
// checks the same permission on every request (backend/app/rbac.py).
import type { Me, Permission, Role } from "../types/auth"

export const ROLES: { value: Role; label: string; description: string }[] = [
  { value: "user", label: "User", description: "A gym member: sees their own membership and books classes." },
  { value: "trainer", label: "Trainer", description: "Teaches classes: sees the classes they teach and who booked each one." },
  { value: "gym_manager", label: "Gym Manager", description: "Manages memberships: start, edit, renew and freeze them, and delete member accounts." },
  { value: "admin", label: "Admin", description: "Everything a Gym Manager can do, plus managing users and roles, and reading the activity log." },
]

export const roleLabel = (role: Role) => ROLES.find((r) => r.value === role)?.label ?? role

/** True when the logged-in person's role holds this permission. */
export const can = (user: Me | null, permission: Permission) => user?.permissions.includes(permission) ?? false

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
  | "activity"
  | "security"

/** What each page needs: the permission of the API calls it makes. */
const PAGE_ACCESS: Record<ProtectedPage, (user: Me) => boolean> = {
  dashboard: (u) => can(u, "dashboard:read"),
  overview: (u) => can(u, "overview:read"),
  members: (u) => can(u, "members:read"),
  classes: (u) => can(u, "classes:manage"),
  payments: (u) => can(u, "payments:manage"),
  announcements: (u) => can(u, "announcements:manage"),
  "my-classes": (u) => can(u, "classes:teach"),
  plans: (u) => can(u, "plans:edit"),
  users: (u) => can(u, "users:read"),
  activity: (u) => can(u, "activity:read"),
  security: (u) => can(u, "activity:read"),
  account: () => true,
  // The member pages call only endpoints about the caller's own account, which any login may use, so no
  // permission is involved. They are laid out for gym members, so they are shown to the User role.
  membership: (u) => u.role === "user",
  timetable: (u) => u.role === "user",
}

export const canOpen = (user: Me, page: ProtectedPage) => PAGE_ACCESS[page](user)

/** Where a person lands after logging in: the first of these pages they may open. */
const HOME_ORDER: ProtectedPage[] = ["dashboard", "overview", "my-classes", "membership", "account"]
export const homePage = (user: Me): ProtectedPage => HOME_ORDER.find((page) => canOpen(user, page)) ?? "account"
