// Small display helpers for announcements.
import type { Announcement } from "../types/announcement"
import { formatDate, formatDateTime, todayUtc } from "./member"

/** Past its end date: the same UTC "today" the backend uses, so members stop seeing it at the same moment. */
export const hasEnded = (a: Announcement) => a.ends_on !== null && a.ends_on < todayUtc()

/** "Posted 21 Nov, 10:30 by Rahim · edited". */
export function postedNote(a: Announcement): string {
  const by = a.posted_by_name ? ` by ${a.posted_by_name}` : ""
  return `Posted ${formatDateTime(a.posted_at)}${by}${a.updated_at ? " · edited" : ""}`
}

/** "Shows until 30 Nov 2026", "Ended 20 Nov 2026" or "No end date". */
export function endNote(a: Announcement): string {
  if (a.ends_on === null) return "No end date"
  return `${hasEnded(a) ? "Ended" : "Shows until"} ${formatDate(a.ends_on)}`
}
