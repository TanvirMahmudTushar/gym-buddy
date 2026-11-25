// fetch helpers for the activity log and the security view: /api/v1/admin/activity (needs activity:read).
import type { ActivityFilters, ActivityPage, SecuritySummary } from "../types/activity"
import { request, requestBlob } from "./api"

const BASE = "/api/v1/admin/activity"
const PAGE_SIZE = 25

/** Only the filters that are set go into the query string. The list and the CSV use the same ones. */
function filterParams(filters: ActivityFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.event) params.set("event", filters.event)
  if (filters.user_id) params.set("user_id", String(filters.user_id))
  if (filters.date_from) params.set("date_from", filters.date_from)
  if (filters.date_to) params.set("date_to", filters.date_to)
  if (filters.q.trim()) params.set("q", filters.q.trim())
  return params
}

export function listActivity(filters: ActivityFilters, offset: number): Promise<ActivityPage> {
  const params = filterParams(filters)
  params.set("offset", String(offset))
  params.set("limit", String(PAGE_SIZE))
  return request<ActivityPage>(`${BASE}?${params}`)
}

/** Every matching row (up to 10,000), newest first. The download is itself written to the log. */
export const exportActivityCsv = (filters: ActivityFilters) => requestBlob(`${BASE}/export.csv?${filterParams(filters)}`)

/** Hostile requests in the last `hours` hours (1 to 168), for addresses and emails with at least `minCount`. */
export const getSecuritySummary = (hours: number, minCount: number) =>
  request<SecuritySummary>(`${BASE}/security?hours=${hours}&min_count=${minCount}`)
