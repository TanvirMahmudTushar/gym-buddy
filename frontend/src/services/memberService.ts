// fetch helpers for the member REST API (/api/v1/members); managers and admins only.
import type { AccountPage } from "../types/auth"
import type { BookedClassPage, BookingWhen } from "../types/gymClass"
import { request } from "./api"
import type { Member, MemberBulkDeleteResult, MemberCreate, MemberFilter, MemberPage, MemberUpdate } from "../types/member"

const BASE = "/api/v1/members"
const PAGE_SIZE = 20

/** q finds members by part of the name, email or phone. */
export function listMembers(filters: { status: MemberFilter | null; q: string }, offset: number): Promise<MemberPage> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(PAGE_SIZE) })
  if (filters.status) params.set("status", filters.status)
  if (filters.q.trim()) params.set("q", filters.q.trim())
  return request<MemberPage>(`${BASE}?${params}`)
}

/** Accounts that signed up but have no membership yet, newest first. */
export function listWaiting(filters: { q: string }, offset: number): Promise<AccountPage> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(PAGE_SIZE) })
  if (filters.q.trim()) params.set("q", filters.q.trim())
  return request<AccountPage>(`${BASE}/waiting?${params}`)
}

export const getMember = (id: number) => request<Member>(`${BASE}/${id}`)

/** Starts a membership on an existing account, found by its email. */
export const createMember = (body: MemberCreate) =>
  request<Member>(BASE, { method: "POST", body: JSON.stringify(body) })

export const updateMember = (id: number, body: MemberUpdate) =>
  request<Member>(`${BASE}/${id}`, { method: "PATCH", body: JSON.stringify(body) })

/** A member's bookings: upcoming ones soonest first, or past ones latest first. */
export function listMemberBookings(id: number, when: BookingWhen, offset: number, limit: number): Promise<BookedClassPage> {
  const params = new URLSearchParams({ when, offset: String(offset), limit: String(limit) })
  return request<BookedClassPage>(`${BASE}/${id}/bookings?${params}`)
}

/** The front desk cancels a booking for the member (not once the class has started). */
export const cancelMemberBooking = (id: number, classId: number) =>
  request<void>(`${BASE}/${id}/bookings/${classId}`, { method: "DELETE" })

/** Deletes the member's whole account. */
export const deleteMember = (id: number) => request<void>(`${BASE}/${id}`, { method: "DELETE" })

export const deleteMembers = (ids: number[]) =>
  request<MemberBulkDeleteResult>(`${BASE}/bulk-delete`, { method: "POST", body: JSON.stringify({ ids }) })
