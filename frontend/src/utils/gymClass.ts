// Helpers for class times. The API sends and expects UTC; the form and the screen use the viewer's local time.

const pad = (n: number) => String(n).padStart(2, "0")

/** UTC time from the API -> the value a datetime-local input shows (local time, no zone). */
export function toLocalInput(isoDateTime: string): string {
  const d = new Date(isoDateTime)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** A datetime-local value (local time) -> UTC for the API. */
export const fromLocalInput = (value: string) => new Date(value).toISOString()

export const formatClassTime = (isoDateTime: string) =>
  new Date(isoDateTime).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })

export const isUpcoming = (isoDateTime: string) => new Date(isoDateTime).getTime() >= Date.now()
