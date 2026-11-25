// Check-in types matching the FastAPI schemas (TDD 5.3).
import type { Page } from "./page"

export interface CheckIn {
  id: number
  member_id: number
  member_name: string
  checked_in_at: string
  /** null while the member is inside, or when the desk never checked them out. */
  checked_out_at: string | null
  recorded_by_name: string | null
}

export type CheckInPage = Page<CheckIn>
