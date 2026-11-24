// Role names, and which pages a logged-in person may open. Page access follows the permissions the server sends
// (GET /users/me), so the menu always matches what the API allows. Hiding a page is not the security: the API
// checks the same permission on every request (backend/app/rbac.py).
import type { Me, Permission, Role } from "../types/auth"

export const ROLES: { value: Role; label: string; description: string }[] = [
  { value: "user", label: "User", description: "A gym member: sees their own membership, books classes and follows the workouts assigned to them." },
  { value: "trainer", label: "Trainer", description: "Teaches classes and marks who came, sees their own clients, and runs training groups." },
  { value: "gym_manager", label: "Gym Manager", description: "Runs the gym day to day: members, attendance, payments, classes, equipment and announcements." },
  { value: "admin", label: "Admin", description: "Everything a Gym Manager can do, plus plans, expenses, reports, users and roles, and the security log." },
]

export const roleLabel = (role: Role) => ROLES.find((r) => r.value === role)?.label ?? role

/** The Users page, or one user's details on it: #/users?user=5. */
export const usersLink = (id: number | null) => (id === null ? "#/users" : `#/users?user=${id}`)

/** True when the logged-in person's role holds this permission. */
export const can = (user: Me | null, permission: Permission) => user?.permissions.includes(permission) ?? false

export type Page = "login" | "signup" | ProtectedPage
export type ProtectedPage =
  | "dashboard"
  | "members"
  | "attendance"
  | "payments"
  | "classes"
  | "training"
  | "equipment"
  | "announcements"
  | "plans"
  | "expenses"
  | "users"
  | "activity"
  | "security"
  | "my-classes"
  | "clients"
  | "membership"
  | "timetable"
  | "account"

/** What each page needs: the permission of the API calls it makes. */
const PAGE_ACCESS: Record<ProtectedPage, (user: Me) => boolean> = {
  // The Dashboard shows its front desk part with overview:read and its admin part with dashboard:read.
  dashboard: (u) => can(u, "overview:read"),
  members: (u) => can(u, "members:read"),
  attendance: (u) => can(u, "check_ins:record"),
  payments: (u) => can(u, "payments:manage"),
  classes: (u) => can(u, "classes:manage"),
  equipment: (u) => can(u, "equipment:read"),
  announcements: (u) => can(u, "announcements:manage"),
  plans: (u) => can(u, "plans:edit"),
  expenses: (u) => can(u, "expenses:manage"),
  users: (u) => can(u, "users:read"),
  activity: (u) => can(u, "activity:read"),
  security: (u) => can(u, "activity:read"),
  "my-classes": (u) => can(u, "classes:teach"),
  clients: (u) => can(u, "clients:read"),
  account: () => true,
  // Training shows the groups the caller is in: any login. Inside a group, the buttons follow the caller's group
  // permissions (my_permissions), which the API checks again on every request.
  training: () => true,
  // The member pages call only endpoints about the caller's own account, which any login may use, so no
  // permission is involved. They are laid out for gym members, so they are shown to the User role.
  membership: (u) => u.role === "user",
  timetable: (u) => u.role === "user",
}

export const canOpen = (user: Me, page: ProtectedPage) => PAGE_ACCESS[page](user)

/** Where a person lands after logging in: the first of these pages they may open. */
const HOME_ORDER: ProtectedPage[] = ["dashboard", "my-classes", "membership", "account"]
export const homePage = (user: Me): ProtectedPage => HOME_ORDER.find((page) => canOpen(user, page)) ?? "account"
