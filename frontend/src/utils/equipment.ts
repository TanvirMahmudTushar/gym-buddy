// Display helpers for equipment.
import type { Equipment, EquipmentCategory, EquipmentFilters, EquipmentStatus } from "../types/equipment"
import { pageLink } from "./hash"
import { addDays, gymToday } from "./time"

export const CATEGORIES: { value: EquipmentCategory; label: string }[] = [
  { value: "cardio", label: "Cardio" },
  { value: "strength", label: "Strength machines" },
  { value: "free_weights", label: "Free weights" },
  { value: "functional", label: "Functional training" },
  { value: "other", label: "Other" },
]

const STATUSES: { value: EquipmentStatus; label: string; pill: string }[] = [
  { value: "working", label: "Working", pill: "pill good" },
  { value: "maintenance", label: "Being repaired", pill: "pill info" },
  { value: "out_of_order", label: "Out of order", pill: "pill bad" },
]

export const SHOW: { value: EquipmentFilters["show"]; label: string }[] = [
  { value: "", label: "All" },
  { value: "working", label: "Working" },
  { value: "needs_attention", label: "Needs attention" },
  { value: "service_due", label: "Service due" },
]

export const categoryLabel = (category: EquipmentCategory) => CATEGORIES.find((c) => c.value === category)?.label ?? category
export const statusInfo = (status: EquipmentStatus) => STATUSES.find((s) => s.value === status) ?? STATUSES[0]

/** Overdue, or due within 7 days: the same rule as the API's service_due filter. */
export const isServiceDue = (item: Equipment) => item.next_service_on !== null && item.next_service_on <= addDays(gymToday(), 7)

/** The address of the Equipment page with one of its lists open. */
export const equipmentLink = (show: EquipmentFilters["show"]) => pageLink("equipment", { show })
