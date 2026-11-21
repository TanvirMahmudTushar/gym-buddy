// A person's contact and safety details, matching the FastAPI ProfileRead schema (TDD 5.3).
// Only they and gym staff can read them (NFR-20).

export interface Profile {
  phone: string | null
  /** YYYY-MM-DD. */
  date_of_birth: string | null
  /** Set together with emergency_contact_phone, or both null. */
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
}

/** PATCH body: only the fields sent change; null clears one. */
export type ProfileUpdate = Partial<Profile>
