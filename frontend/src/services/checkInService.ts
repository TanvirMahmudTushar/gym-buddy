// fetch helpers for check-ins (gym managers and admins only).
import type { CheckIn, CheckInPage } from "../types/checkIn"
import { request } from "./api"

export const recordCheckIn = (memberId: number) =>
  request<CheckIn>(`/api/v1/members/${memberId}/check-ins`, { method: "POST" })

export function listMemberCheckIns(memberId: number, offset: number, limit: number): Promise<CheckInPage> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) })
  return request<CheckInPage>(`/api/v1/members/${memberId}/check-ins?${params}`)
}

export const checkOut = (checkInId: number) => request<CheckIn>(`/api/v1/check-ins/${checkInId}/check-out`, { method: "POST" })

/** Everyone checked in on a UTC day (YYYY-MM-DD), newest first. inside keeps only who is in the gym now. */
export function listCheckIns(filters: { day: string; inside: boolean; q: string }, offset: number): Promise<CheckInPage> {
  const params = new URLSearchParams({ day: filters.day, offset: String(offset), limit: "50" })
  if (filters.inside) params.set("inside", "true")
  if (filters.q.trim()) params.set("q", filters.q.trim())
  return request<CheckInPage>(`/api/v1/check-ins?${params}`)
}
