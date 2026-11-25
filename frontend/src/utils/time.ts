// Dates and times. The API sends times in UTC; the app always shows and reads them as the gym's own time (Dhaka, UTC+6,
// no daylight saving time), so staff and members see the same clock wherever their browser is. A "day" is the gym's
// day too, the same as in the backend (backend/app/models.py, gym_today).

const GYM_TIME_ZONE = "Asia/Dhaka"
const GYM_OFFSET = "+06:00"
const GYM_OFFSET_MS = 6 * 60 * 60 * 1000

/** The gym's date and time as text, such as 2026-11-25T13:46:00.000Z with the gym's clock instead of UTC. */
const gymClock = (time: Date) => new Date(time.getTime() + GYM_OFFSET_MS).toISOString()

/** Today at the gym, as YYYY-MM-DD. */
export const gymToday = () => gymClock(new Date()).slice(0, 10)

/** The gym's day of a time from the API, as YYYY-MM-DD. */
export const gymDay = (isoDateTime: string) => gymClock(new Date(isoDateTime)).slice(0, 10)

/** A YYYY-MM-DD date plus a number of days. */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Whole days from one YYYY-MM-DD date to another. */
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)

/** "25 Nov 2026", for a date (YYYY-MM-DD) or a time from the API. */
export function formatDate(value: string): string {
  const day = value.length > 10 ? gymDay(value) : value
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
}

/** "Wed 25 Nov", for a date (YYYY-MM-DD). */
export const formatWeekday = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })

/** "Wednesday, 25 November", today at the gym. */
export const longToday = () =>
  new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: GYM_TIME_ZONE })

/** "13:46" */
export const formatTime = (isoDateTime: string) =>
  new Date(isoDateTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: GYM_TIME_ZONE })

/** "25 Nov 2026, 13:46" */
export const formatDateTime = (isoDateTime: string) => `${formatDate(isoDateTime)}, ${formatTime(isoDateTime)}`

/** "Thu 26 Nov, 07:00", for a class. */
export const formatClassTime = (isoDateTime: string) => `${formatWeekday(gymDay(isoDateTime))}, ${formatTime(isoDateTime)}`

/** A time from the API -> the value a datetime-local input shows (the gym's clock). */
export const toGymInput = (isoDateTime: string) => gymClock(new Date(isoDateTime)).slice(0, 16)

/** A datetime-local value (the gym's clock) -> UTC for the API. */
export const fromGymInput = (value: string) => new Date(`${value}:00${GYM_OFFSET}`).toISOString()

/** Now, as a datetime-local value: the earliest start a new class can have. */
export const gymNowInput = () => gymClock(new Date()).slice(0, 16)

export const isUpcoming = (isoDateTime: string) => new Date(isoDateTime).getTime() >= Date.now()
