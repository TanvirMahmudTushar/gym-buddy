// Equipment types matching the FastAPI schemas (TDD 5.3).

export type EquipmentCategory = "cardio" | "strength" | "free_weights" | "functional" | "other"
export type EquipmentStatus = "working" | "maintenance" | "out_of_order"

export interface Equipment {
  id: number
  name: string
  category: EquipmentCategory
  quantity: number
  status: EquipmentStatus
  purchased_on: string | null
  /** How often it is serviced; null when it needs no regular service. */
  service_every_days: number | null
  last_serviced_on: string | null
  next_service_on: string | null
  /** The fault someone reported. */
  issue: string | null
  reported_by_name: string | null
  reported_at: string | null
  notes: string | null
}

export interface EquipmentBody {
  name: string
  category: EquipmentCategory
  quantity: number
  purchased_on: string | null
  service_every_days: number | null
  last_serviced_on: string | null
  notes: string | null
}

/** Empty means any. needs_attention: broken or being repaired. service_due: overdue, or due within 7 days. */
export interface EquipmentFilters {
  category: EquipmentCategory | ""
  show: "" | "working" | "needs_attention" | "service_due"
  q: string
}
