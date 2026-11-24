// fetch helpers for equipment: /api/v1/equipment. Trainers read the list and report faults; gym managers and admins
// manage it.
import type { Equipment, EquipmentBody, EquipmentFilters, EquipmentStatus } from "../types/equipment"
import type { Page } from "../types/moderation"
import { request } from "./api"

const BASE = "/api/v1/equipment"
const PAGE_SIZE = 20

export function listEquipment(filters: EquipmentFilters, offset: number): Promise<Page<Equipment>> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(PAGE_SIZE) })
  if (filters.category) params.set("category", filters.category)
  if (filters.show === "working") params.set("status", "working")
  else if (filters.show) params.set(filters.show, "true")
  if (filters.q.trim()) params.set("q", filters.q.trim())
  return request<Page<Equipment>>(`${BASE}?${params}`)
}

export const createEquipment = (body: EquipmentBody) => request<Equipment>(BASE, { method: "POST", body: JSON.stringify(body) })

export const updateEquipment = (id: number, changes: Partial<EquipmentBody & { status: EquipmentStatus }>) =>
  request<Equipment>(`${BASE}/${id}`, { method: "PATCH", body: JSON.stringify(changes) })

/** Marks it out of order, with what is wrong. */
export const reportFault = (id: number, issue: string) =>
  request<Equipment>(`${BASE}/${id}/report`, { method: "POST", body: JSON.stringify({ issue }) })

/** Serviced or repaired today: it is working again and the next service is counted from today. */
export const recordService = (id: number) => request<Equipment>(`${BASE}/${id}/service`, { method: "POST" })

export const deleteEquipment = (id: number) => request<void>(`${BASE}/${id}`, { method: "DELETE" })
