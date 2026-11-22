// fetch helpers for content moderation: /api/v1/admin/workouts and /api/v1/admin/groups (needs content:moderate).
import type { GroupFilters, ModerationGroup, ModerationWorkout, Page, WorkoutFilters } from "../types/moderation"
import { request, requestBlob } from "./api"

const BASE = "/api/v1/admin"
const PAGE_SIZE = 20

/** Only the filters that are set go into the query string. The list and the CSV use the same ones. */
function params(filters: WorkoutFilters | GroupFilters): URLSearchParams {
  const query = new URLSearchParams()
  if (filters.owner_id) query.set("owner_id", String(filters.owner_id))
  if ("kind" in filters && filters.kind) query.set("kind", filters.kind)
  if (filters.date_from) query.set("date_from", filters.date_from)
  if (filters.date_to) query.set("date_to", filters.date_to)
  if (filters.q.trim()) query.set("q", filters.q.trim())
  return query
}

function paged(filters: WorkoutFilters | GroupFilters, offset: number): URLSearchParams {
  const query = params(filters)
  query.set("offset", String(offset))
  query.set("limit", String(PAGE_SIZE))
  return query
}

export const listWorkouts = (filters: WorkoutFilters, offset: number) =>
  request<Page<ModerationWorkout>>(`${BASE}/workouts?${paged(filters, offset)}`)

export const exportWorkoutsCsv = (filters: WorkoutFilters) => requestBlob(`${BASE}/workouts/export.csv?${params(filters)}`)

/** Up to 100 at once; ids that match nothing are skipped. Each delete is written to the activity log. */
export const deleteWorkouts = (ids: number[]) =>
  request<{ deleted: number }>(`${BASE}/workouts/bulk-delete`, { method: "POST", body: JSON.stringify({ ids }) })

export const listGroups = (filters: GroupFilters, offset: number) =>
  request<Page<ModerationGroup>>(`${BASE}/groups?${paged(filters, offset)}`)

export const exportGroupsCsv = (filters: GroupFilters) => requestBlob(`${BASE}/groups/export.csv?${params(filters)}`)

/** Deletes the groups with their workouts and memberships. */
export const deleteGroups = (ids: number[]) =>
  request<{ deleted: number }>(`${BASE}/groups/bulk-delete`, { method: "POST", body: JSON.stringify({ ids }) })
