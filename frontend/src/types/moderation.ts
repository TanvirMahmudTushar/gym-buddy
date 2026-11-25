// Content moderation types (admins), matching the FastAPI schemas (TDD 5.3).
import type { Workout, WorkoutStatus } from "./workout"

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

/** The All workouts filters. Dates are the workout's date, both included; empty means any. */
export interface WorkoutFilters {
  owner_id: number | null
  group_id: number | null
  status: WorkoutStatus | ""
  date_from: string
  date_to: string
  q: string
}

/** The All groups filters. Dates are the day the group was made, both included. */
export interface GroupFilters {
  owner_id: number | null
  date_from: string
  date_to: string
  q: string
}
