// fetch helpers for the logged-in person's own membership and visits: /api/v1/users/me.
import type { CheckInPage } from "../types/checkIn"
import type { BookedClassPage, BookingWhen } from "../types/gymClass"
import type { Member } from "../types/member"
import { request } from "./api"

export const getMyMembership = () => request<Member>("/api/v1/users/me/membership")

/** My own bookings: upcoming ones soonest first, or past ones latest first. */
export function listMyBookings(when: BookingWhen, offset: number, limit: number): Promise<BookedClassPage> {
  const params = new URLSearchParams({ when, offset: String(offset), limit: String(limit) })
  return request<BookedClassPage>(`/api/v1/users/me/bookings?${params}`)
}

export function listMyCheckIns(offset: number, limit: number): Promise<CheckInPage> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) })
  return request<CheckInPage>(`/api/v1/users/me/check-ins?${params}`)
}
