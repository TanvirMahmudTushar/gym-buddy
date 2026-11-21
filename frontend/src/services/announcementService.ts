// fetch helpers for announcements: /api/v1/announcements. Anyone logged in reads the current ones;
// gym managers and admins also see ended ones, and post, edit and delete.
import type { Announcement, AnnouncementBody, AnnouncementPage } from "../types/announcement"
import { request } from "./api"

const BASE = "/api/v1/announcements"

/** Newest first. includeEnded (staff only) also lists the ones past their end date. */
export function listAnnouncements(offset: number, limit: number, includeEnded = false): Promise<AnnouncementPage> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) })
  if (includeEnded) params.set("include_ended", "true")
  return request<AnnouncementPage>(`${BASE}?${params}`)
}

export const createAnnouncement = (body: AnnouncementBody) =>
  request<Announcement>(BASE, { method: "POST", body: JSON.stringify(body) })

export const updateAnnouncement = (id: number, body: Partial<AnnouncementBody>) =>
  request<Announcement>(`${BASE}/${id}`, { method: "PATCH", body: JSON.stringify(body) })

export const deleteAnnouncement = (id: number) => request<void>(`${BASE}/${id}`, { method: "DELETE" })
