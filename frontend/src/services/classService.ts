// fetch helpers for classes: /api/v1/classes. Reading is open to anyone logged in; the rest is for gym managers and admins.
import type { BookingPage, ClassBody, ClassPage, GymClass } from "../types/gymClass"
import { request } from "./api"

const BASE = "/api/v1/classes"
const PAGE_SIZE = 20

export function listClasses(offset: number, upcomingOnly: boolean): Promise<ClassPage> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(PAGE_SIZE) })
  if (upcomingOnly) params.set("upcoming", "true")
  return request<ClassPage>(`${BASE}?${params}`)
}

export const createClass = (body: ClassBody) => request<GymClass>(BASE, { method: "POST", body: JSON.stringify(body) })

export const updateClass = (id: number, body: Partial<ClassBody>) =>
  request<GymClass>(`${BASE}/${id}`, { method: "PATCH", body: JSON.stringify(body) })

export const deleteClass = (id: number) => request<void>(`${BASE}/${id}`, { method: "DELETE" })

export const listBookings = (id: number): Promise<BookingPage> => request<BookingPage>(`${BASE}/${id}/bookings?limit=100`)
