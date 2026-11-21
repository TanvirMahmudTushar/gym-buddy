// fetch helpers for trainers: /api/v1/trainers. The list is for gym managers and admins; My classes is for trainers.
import type { BookingWhen, ClassPage, Trainer } from "../types/gymClass"
import { request } from "./api"

const BASE = "/api/v1/trainers"

/** Every account with the Trainer role, by name: the choices for a class's trainer. */
export const listTrainers = () => request<Trainer[]>(BASE)

/** The classes the logged-in trainer teaches: upcoming soonest first, or past latest first. */
export function listMyClasses(when: BookingWhen, offset: number, limit: number): Promise<ClassPage> {
  const params = new URLSearchParams({ when, offset: String(offset), limit: String(limit) })
  return request<ClassPage>(`${BASE}/me/classes?${params}`)
}
