import { useEffect, useState } from "react"
import { listBookings } from "../services/classService"
import type { Booking } from "../types/gymClass"
import { errorText, formatDateTime, membersLink } from "../utils/member"

// Who has booked a class, in the order they booked.
export default function ClassBookings({ classId }: { classId: number }) {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

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

  if (loading) return <p className="empty">Loading bookings…</p>
  if (error)
    return (
      <p className="error" role="alert">
        {error}
      </p>
    )
  if (bookings.length === 0) return <p className="empty">Nobody has booked this class yet.</p>
  return (
    <ul className="visit-list">
      {bookings.map((b) => (
        <li key={b.member_id}>
          <a href={membersLink({ member: b.member_id })}>{b.member_name}</a>
          <span className="hint">booked {formatDateTime(b.booked_at)}</span>
        </li>
      ))}
    </ul>
  )
}
