// fetch helpers for the member REST API (/api/v1/members); managers and admins only.
import type { AccountLookup } from "../types/auth"
import { request } from "./api"
import type { Member, MemberBulkDeleteResult, MemberCreate, MemberPage, MemberStatus, MemberUpdate } from "../types/member"

const BASE = "/api/v1/members"
const PAGE_SIZE = 20

export function listMembers(offset: number, status: MemberStatus | null): Promise<MemberPage> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(PAGE_SIZE) })
  if (status) params.set("status", status)
  return request<MemberPage>(`${BASE}?${params}`)
}

export const getMember = (id: number) => request<Member>(`${BASE}/${id}`)

export const createMember = (body: MemberCreate) =>
  request<Member>(BASE, { method: "POST", body: JSON.stringify(body) })

export const updateMember = (id: number, body: MemberUpdate) =>
  request<Member>(`${BASE}/${id}`, { method: "PATCH", body: JSON.stringify(body) })

export const deleteMember = (id: number) => request<void>(`${BASE}/${id}`, { method: "DELETE" })

export const deleteMembers = (ids: number[]) =>
  request<MemberBulkDeleteResult>(`${BASE}/bulk-delete`, { method: "POST", body: JSON.stringify({ ids }) })

// Staff find the account to link to a member by exact email or by ID.
export const lookupAccountByEmail = (email: string) =>
  request<AccountLookup>(`/api/v1/users/lookup?${new URLSearchParams({ email })}`)

export const lookupAccountById = (id: number) => request<AccountLookup>(`/api/v1/users/lookup?id=${id}`)
