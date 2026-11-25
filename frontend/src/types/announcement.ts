// Announcements from the gym, matching the FastAPI schemas (TDD 5.3).
import type { Page } from "./page"

export interface Announcement {
  id: number
  title: string
  message: string
  /** The last day it shows on (YYYY-MM-DD), or null to show it until it is deleted. */
  ends_on: string | null
  posted_at: string
  /** Null until it is edited. */
  updated_at: string | null
  /** Null once the account that posted it is deleted. */
  posted_by_name: string | null
}

export type AnnouncementPage = Page<Announcement>

/** What the form sends. An edit leaves ends_on out when it did not change. */
export interface AnnouncementBody {
  title: string
  message: string
  ends_on?: string | null
}
