// fetch helpers for check-ins (gym managers and admins only).
import type { CheckIn, CheckInPage } from "../types/checkIn"
import { request } from "./api"

export const recordCheckIn = (memberId: number) =>
  request<CheckIn>(`/api/v1/members/${memberId}/check-ins`, { method: "POST" })

export function listMemberCheckIns(memberId: number, offset: number, limit: number): Promise<CheckInPage> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) })
  return request<CheckInPage>(`/api/v1/members/${memberId}/check-ins?${params}`)
}

export const listTodayCheckIns = () => request<CheckInPage>("/api/v1/check-ins/today?limit=50")
