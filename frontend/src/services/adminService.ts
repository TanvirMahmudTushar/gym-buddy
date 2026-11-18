// fetch helpers for user management (admins only): /api/v1/admin/users.
import type { Role, User, UserPage } from "../types/auth"
import { request } from "./api"

const BASE = "/api/v1/admin/users"
const PAGE_SIZE = 20

export function listUsers(offset: number): Promise<UserPage> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(PAGE_SIZE) })
  return request<UserPage>(`${BASE}?${params}`)
}

export const changeRole = (id: number, role: Role) =>
  request<User>(`${BASE}/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) })
