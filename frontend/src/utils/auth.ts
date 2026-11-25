// Role names, and which pages a logged-in person may open. Page access follows the permissions the server sends
// (GET /users/me), so the menu always matches what the API allows. Hiding a page is not the security: the API
// checks the same permission on every request (backend/app/rbac.py).
import type { Me, Permission, Role, User } from "../types/auth"
import { pageLink } from "./hash"

export const ROLES: { value: Role; label: string; description: string }[] = [
  { value: "user", label: "User", description: "A gym member: their own membership, class bookings and workouts." },
  { value: "trainer", label: "Trainer", description: "Teaches classes, sees their own clients and runs training groups." },
  { value: "gym_manager", label: "Gym Manager", description: "Runs the gym day to day: members, attendance, payments, classes and equipment." },
  { value: "admin", label: "Admin", description: "Everything a Gym Manager can do, plus plans, expenses, users and roles, and the security log." },
]

export const roleLabel = (role: Role) => ROLES.find((r) => r.value === role)?.label ?? role

/** The Users page, or one user's details on it: #/users?user=5. */
export const usersLink = (id: number | null = null) => pageLink("users", { user: id })

/** "a Trainer", "an Admin". */
export function aRole(role: Role): string {
  const label = roleLabel(role)
  return `${/^[AEIOU]/.test(label) ? "an" : "a"} ${label}`
}

/** An admin's account: other admins cannot ban it or reset its password (backend/app/rbac.py, is_admin). */
export const isAdminAccount = (user: Pick<User, "role">) => user.role === "admin"

/** True when the logged-in person's role holds this permission. */
export const can = (user: Me | null, permission: Permission) => user?.permissions.includes(permission) ?? false

/** Every page, with its name in the menu and the browser's title bar. */
export const PAGE_TITLES = {
  login: "Log in",
  signup: "Sign up",
  dashboard: "Dashboard",
  members: "Members",
  attendance: "Attendance",
  payments: "Payments",
  classes: "Classes",
  training: "Training",
  equipment: "Equipment",
  announcements: "Announcements",
  plans: "Plans",
  expenses: "Expenses",
  users: "Users",
  activity: "Activity log",
  security: "Security",
  "my-classes": "My classes",
  clients: "My clients",
  membership: "My membership",
  timetable: "Book a class",
  account: "My account",
}

export type Page = keyof typeof PAGE_TITLES
export type ProtectedPage = Exclude<Page, "login" | "signup">

const isGymMember = (u: Me) => u.plan !== null || u.permissions.length === 0

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
  // The member pages call only endpoints about the caller's own account, which any login may use. They are for whoever
  // has a membership, and for plain Users (a role with no permissions) who may still get one.
  membership: isGymMember,
  timetable: isGymMember,
}

export const canOpen = (user: Me, page: ProtectedPage) => PAGE_ACCESS[page](user)

/** Where a person lands after logging in: the first of these pages they may open. */
const HOME_ORDER: ProtectedPage[] = ["dashboard", "my-classes", "membership", "account"]
export const homePage = (user: Me): ProtectedPage => HOME_ORDER.find((page) => canOpen(user, page)) ?? "account"
