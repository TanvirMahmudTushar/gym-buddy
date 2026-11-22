// Content moderation types (admins), matching the FastAPI schemas (TDD 5.3).
import type { Workout } from "./workout"

/** A workout as a moderator sees it: with the owner's email, so it is clear whose it is. */
export interface ModerationWorkout extends Workout {
  owner_email: string | null
}

export interface ModerationGroup {
  id: number
  name: string
  owner_id: number
  owner_name: string
  owner_email: string
  created_at: string
  /** The owner included. */
  member_count: number
  workout_count: number
}

export interface Page<T> {
  items: T[]
  total: number
  offset: number
  limit: number
}

/** The workouts tab's filters. Dates are the workout's date, both included; empty means any. */
export interface WorkoutFilters {
  owner_id: number | null
  kind: "personal" | "group" | ""
  date_from: string
  date_to: string
  q: string
}

/** The groups tab's filters. Dates are the UTC day the group was made, both included. */
export interface GroupFilters {
  owner_id: number | null
  date_from: string
  date_to: string
  q: string
}
