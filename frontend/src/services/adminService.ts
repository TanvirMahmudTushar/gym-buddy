// fetch helpers for the admin-only endpoints: /api/v1/admin.
import type { AdminStats, AdminUser, AdminUserPage, PasswordResetResult, Role } from "../types/auth"
import type { PlanPrice, RevenueStats } from "../types/payment"
import type { Plan } from "../types/member"
import { request } from "./api"

const BASE = "/api/v1/admin"
const PAGE_SIZE = 20

/** q finds users by part of the name or email. */
export function listUsers(offset: number, q = ""): Promise<AdminUserPage> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(PAGE_SIZE) })
  if (q.trim()) params.set("q", q.trim())
  return request<AdminUserPage>(`${BASE}/users?${params}`)
}

export const changeRole = (id: number, role: Role) =>
  request<AdminUser>(`${BASE}/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) })

export const banUser = (id: number, reason: string) =>
  request<AdminUser>(`${BASE}/users/${id}/ban`, { method: "POST", body: JSON.stringify({ reason: reason || null }) })

/** Gives the account a temporary password (returned once); they must choose a new one when they log in. */
export const resetPassword = (id: number) =>
  request<PasswordResetResult>(`${BASE}/users/${id}/reset-password`, { method: "POST" })

export const unbanUser = (id: number) => request<AdminUser>(`${BASE}/users/${id}/unban`, { method: "POST" })

export const getStats = () => request<AdminStats>(`${BASE}/stats`)

export const getRevenue = () => request<RevenueStats>(`${BASE}/revenue`)

// Set a plan's price (whole taka) and the number of days a renewal adds.
export const updatePlan = (plan: Plan, body: { price: number; duration_days: number }) =>
  request<PlanPrice>(`${BASE}/plans/${plan}`, { method: "PUT", body: JSON.stringify(body) })
