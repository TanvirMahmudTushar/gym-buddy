// The contact and safety details form, shared by My account and the staff Edit member form, with the API's checks.
import type { Profile } from "../types/profile"
import { formatDate, gymToday } from "./time"

export const EARLIEST_BIRTH_DATE = "1900-01-01"

/** The form's text values: "" for anything not given. */
export type ProfileForm = Record<keyof Profile, string>

export type ProfileErrors = Partial<Record<"date_of_birth" | "emergency_contact", string>>

export const toProfileForm = (p: Profile): ProfileForm => ({
  phone: p.phone ?? "",
  date_of_birth: p.date_of_birth ?? "",
  emergency_contact_name: p.emergency_contact_name ?? "",
  emergency_contact_phone: p.emergency_contact_phone ?? "",
})

/** What the API is sent: trimmed, with blanks as null. */
export const toProfileBody = (f: ProfileForm): Profile => ({
  phone: f.phone.trim() || null,
  date_of_birth: f.date_of_birth || null,
  emergency_contact_name: f.emergency_contact_name.trim() || null,
  emergency_contact_phone: f.emergency_contact_phone.trim() || null,
})

export function checkProfile(f: ProfileForm): ProfileErrors {
  const errors: ProfileErrors = {}
  if (f.date_of_birth && (f.date_of_birth < EARLIEST_BIRTH_DATE || f.date_of_birth > gymToday()))
    errors.date_of_birth = `Pick a date between ${formatDate(EARLIEST_BIRTH_DATE)} and today.`
  if (!f.emergency_contact_name.trim() !== !f.emergency_contact_phone.trim())
    errors.emergency_contact = "Give the emergency contact both a name and a phone, or leave both empty."
  return errors
}

/** Whole years from the date of birth to today. */
function age(dateOfBirth: string): number {
  const [by, bm, bd] = dateOfBirth.split("-").map(Number)
  const [ty, tm, td] = gymToday().split("-").map(Number)
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0)
}

/** "12 Apr 1995 (age 31)". */
export const birthDateText = (dateOfBirth: string) => `${formatDate(dateOfBirth)} (age ${age(dateOfBirth)})`

/** "Rina (mother), 01811000000", or null when there is none. */
export const emergencyContactText = (p: Profile) =>
  p.emergency_contact_name && p.emergency_contact_phone ? `${p.emergency_contact_name}, ${p.emergency_contact_phone}` : null
