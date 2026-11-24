// Class types matching the FastAPI schemas (TDD 5.3).
export interface GymClass {
  id: number
  name: string
  description: string | null
  /** The trainer's account; null for no trainer, or for a class that only has an old text name. */
  trainer_id: number | null
  /** The trainer's current name, or the old text name on a class from before trainers were accounts. */
  trainer_name: string | null
  starts_at: string
  duration_minutes: number
  capacity: number
  booked_count: number
  /** True when the logged-in person booked this class. */
  is_booked_by_me: boolean
  created_at: string
  updated_at: string
}

export interface ClassPage {
  items: GymClass[]
  total: number
  offset: number
  limit: number
}

/** The fields a gym manager sets when creating or editing a class. */
export interface ClassBody {
  name: string
  description: string | null
  /** A Trainer's account id, or null for none. Left out on an edit, the trainer (or old text name) stays. */
  trainer_id?: number | null
  starts_at: string
  duration_minutes: number
  capacity: number
}

/** An account with the Trainer role, as a choice in the class and member forms. */
export interface Trainer {
  id: number
  name: string
}

/** A member as their personal trainer sees them. */
export interface Client {
  id: number
  name: string
  email: string
  phone: string | null
  plan: string
  expires_on: string
  is_frozen: boolean
  last_visit_at: string | null
}

export interface Booking {
  class_id: number
  member_id: number
  member_name: string
  booked_at: string
  /** Marked by the trainer or the front desk; null when not marked. */
  attended: boolean | null
}

/** Which of a member's bookings, or a trainer's classes, to list: classes still to come, or ones that have started. */
export type BookingWhen = "upcoming" | "past"

/** One of a member's bookings, with the class it is for. */
export interface BookedClass {
  class_id: number
  class_name: string
  starts_at: string
  duration_minutes: number
  trainer_name: string | null
  booked_at: string
  attended: boolean | null
}

export interface BookedClassPage {
  items: BookedClass[]
  total: number
  offset: number
  limit: number
}

export interface BookingPage {
  items: Booking[]
  total: number
  offset: number
  limit: number
}
