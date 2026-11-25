import type { Role } from "../types/auth"
import { roleLabel } from "../utils/auth"

const LOOK: Record<Role, string> = { user: "", trainer: "warn", gym_manager: "info", admin: "accent" }

export default function RolePill({ role }: { role: Role }) {
  return <span className={`pill ${LOOK[role]}`}>{roleLabel(role)}</span>
}
