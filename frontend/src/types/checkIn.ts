// Check-in types matching the FastAPI schemas (TDD 5.3).
export interface CheckIn {
  id: number
  member_id: number
  member_name: string
  checked_in_at: string
  recorded_by_name: string | null
}

export interface CheckInPage {
  items: CheckIn[]
  total: number
  offset: number
  limit: number
}
