// fetch helpers for trainers: /api/v1/trainers. The list is for gym managers and admins; My classes and My clients are
// for trainers.
import type { BookingWhen, ClassPage, Client, Trainer } from "../types/gymClass"
import type { Page } from "../types/page"
import { request } from "./api"

const BASE = "/api/v1/trainers"

/** Every account with the Trainer role, by name: the choices for a class's or a member's trainer. */
export const listTrainers = () => request<Trainer[]>(BASE)

/** The classes the logged-in trainer teaches: upcoming soonest first, or past latest first. */
export function listMyClasses(when: BookingWhen, offset: number, limit: number): Promise<ClassPage> {
  const params = new URLSearchParams({ when, offset: String(offset), limit: String(limit) })
  return request<ClassPage>(`${BASE}/me/classes?${params}`)
}

/** The members the logged-in trainer is the personal trainer of, by name. */
export function listMyClients(offset: number, limit = 20): Promise<Page<Client>> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) })
  return request<Page<Client>>(`${BASE}/me/clients?${params}`)
}
