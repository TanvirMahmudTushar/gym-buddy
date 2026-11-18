// fetch helpers for the admin-only endpoints: /api/v1/admin.
import type { AdminStats, AdminUser, AdminUserPage, Role } from "../types/auth"
import { request } from "./api"

const BASE = "/api/v1/admin"
const PAGE_SIZE = 20

export function listUsers(offset: number): Promise<AdminUserPage> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(PAGE_SIZE) })
  return request<AdminUserPage>(`${BASE}/users?${params}`)
}

export const changeRole = (id: number, role: Role) =>
  request<AdminUser>(`${BASE}/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) })

export const banUser = (id: number, reason: string) =>
  request<AdminUser>(`${BASE}/users/${id}/ban`, { method: "POST", body: JSON.stringify({ reason: reason || null }) })

export const unbanUser = (id: number) => request<AdminUser>(`${BASE}/users/${id}/unban`, { method: "POST" })

export const getStats = () => request<AdminStats>(`${BASE}/stats`)
