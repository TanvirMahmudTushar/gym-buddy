// fetch helpers for the admin-only endpoints: /api/v1/admin.
import type {
  AdminStats,
  AdminUser,
  AdminUserDetail,
  AdminUserPage,
  BulkBanResult,
  BulkUnbanResult,
  PasswordResetResult,
  Role,
  UserFilters,
} from "../types/auth"
import type { RevenueStats } from "../types/payment"
import { request, requestBlob } from "./api"

const BASE = "/api/v1/admin"
const PAGE_SIZE = 20

/** Only the filters that are set go into the query string. The list and the CSV use the same ones. */
function userFilterParams(filters: UserFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.q.trim()) params.set("q", filters.q.trim())
  if (filters.role) params.set("role", filters.role)
  if (filters.status) params.set("status", filters.status)
  return params
}

/** q finds users by part of the name or email; role and status narrow it down. */
export function listUsers(filters: UserFilters, offset: number): Promise<AdminUserPage> {
  const params = userFilterParams(filters)
  params.set("offset", String(offset))
  params.set("limit", String(PAGE_SIZE))
  return request<AdminUserPage>(`${BASE}/users?${params}`)
}

/** Every user matching the filters, newest first. The download is written to the activity log. */
export const exportUsersCsv = (filters: UserFilters) => requestBlob(`${BASE}/users/export.csv?${userFilterParams(filters)}`)

export const getUserDetail = (id: number) => request<AdminUserDetail>(`${BASE}/users/${id}`)

/** Logs the user out of every browser: their next request gets 401. */
export const revokeSessions = (id: number) =>
  request<{ revoked: number }>(`${BASE}/users/${id}/revoke-sessions`, { method: "POST" })

/** Up to 100 at once. Yourself, admins and accounts already banned come back in skipped. */
export const bulkBan = (ids: number[], reason: string) =>
  request<BulkBanResult>(`${BASE}/users/bulk-ban`, { method: "POST", body: JSON.stringify({ ids, reason: reason || null }) })

export const bulkUnban = (ids: number[], reason: string) =>
  request<BulkUnbanResult>(`${BASE}/users/bulk-unban`, { method: "POST", body: JSON.stringify({ ids, reason: reason || null }) })

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
