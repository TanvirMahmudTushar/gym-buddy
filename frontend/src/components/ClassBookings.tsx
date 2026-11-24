import { useEffect, useState } from "react"
import { listBookings, markAttendance } from "../services/classService"
import type { Booking } from "../types/gymClass"
import { errorText, formatDateTime, membersLink } from "../utils/member"

interface Props {
  classId: number
  startsAt: string
  /** Names open the member on the Members page; off for a trainer, who cannot open it. */
  linkMembers?: boolean
}

// Attendance opens this long before the class starts (the API checks it too).
const OPENS_MS = 60 * 60 * 1000

// Who has booked a class, in the order they booked, and from an hour before it starts, who came.
export default function ClassBookings({ classId, startsAt, linkMembers = true }: Props) {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState("")

  const canMark = Date.parse(startsAt) - OPENS_MS <= Date.now()

  useEffect(() => {
    let ignore = false
    listBookings(classId)
      .then((page) => !ignore && setBookings(page.items))
      .catch((err) => !ignore && setError(errorText(err)))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [classId])

  /** Pressing the mark a person already has clears it. */
  async function mark(b: Booking, attended: boolean) {
    setBusyId(b.member_id)
    setError("")
    try {
      const saved = await markAttendance(classId, b.member_id, b.attended === attended ? null : attended)
      setBookings((prev) => prev.map((x) => (x.member_id === saved.member_id ? saved : x)))
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <p className="empty">Loading bookings…</p>
  if (bookings.length === 0 && !error) return <p className="empty">Nobody has booked this class.</p>
  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <ul className="visit-list">
        {bookings.map((b) => (
          <li key={b.member_id}>
            <span>
              {linkMembers ? <a href={membersLink({ member: b.member_id })}>{b.member_name}</a> : b.member_name}{" "}
              <span className="hint">booked {formatDateTime(b.booked_at)}</span>
            </span>
            {canMark && (
              <span className="chips" role="group" aria-label={`Attendance of ${b.member_name}`}>
                <button type="button" className="chip" aria-pressed={b.attended === true} onClick={() => mark(b, true)} disabled={busyId !== null}>
                  Came
                </button>
                <button type="button" className="chip" aria-pressed={b.attended === false} onClick={() => mark(b, false)} disabled={busyId !== null}>
                  Missed
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {!canMark && bookings.length > 0 && <p className="hint">Attendance can be marked from one hour before the class starts.</p>}
    </>
  )
}
