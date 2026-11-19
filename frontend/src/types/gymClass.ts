// Class types matching the FastAPI schemas (TDD 5.3).
export interface GymClass {
  id: number
  name: string
  description: string | null
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
  trainer_name: string | null
  starts_at: string
  duration_minutes: number
  capacity: number
}

export interface Booking {
  class_id: number
  member_id: number
  member_name: string
  booked_at: string
}

export interface BookingPage {
  items: Booking[]
  total: number
  offset: number
  limit: number
}
