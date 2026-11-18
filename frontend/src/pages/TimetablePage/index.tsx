import { useEffect, useState } from "react"
import { bookClass, cancelBooking, listClasses } from "../../services/classService"
import type { GymClass } from "../../types/gymClass"
import { formatClassTime } from "../../utils/gymClass"
import { errorText } from "../../utils/member"

interface ItemProps {
  gymClass: GymClass
  /** Called when the class changed, with its new booking state. */
  onBooked: (id: number, booked: boolean) => void
  /** Called when a booking was refused, so the list can refresh its numbers. */
  onRefused: () => void
}

function TimetableItem({ gymClass: c, onBooked, onRefused }: ItemProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const full = c.booked_count >= c.capacity

  async function toggle() {
    setBusy(true)
    setError("")
    try {
      if (c.is_booked_by_me) await cancelBooking(c.id)
      else await bookClass(c.id)
      onBooked(c.id, !c.is_booked_by_me)
    } catch (err) {
      setError(errorText(err))
      onRefused()
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="class-item">
      <div className="toolbar">
        <h3>{c.name}</h3>
        <span className={full ? "pill expired" : "pill active"}>
          {c.booked_count} / {c.capacity} booked
        </span>
      </div>
      <p className="hint">
        {formatClassTime(c.starts_at)} · {c.duration_minutes} min{c.trainer_name ? ` · ${c.trainer_name}` : ""}
      </p>
      {c.description && <p>{c.description}</p>}
      <div className="actions">
        {c.is_booked_by_me ? (
          <>
            <span className="pill active">You are booked</span>
            <button type="button" onClick={toggle} disabled={busy}>
              {busy ? "Cancelling…" : "Cancel booking"}
            </button>
          </>
        ) : (
          <button type="button" className="primary" onClick={toggle} disabled={busy || full}>
            {busy ? "Booking…" : full ? "Class full" : "Book"}
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </li>
  )
}

// A User's view of the timetable: upcoming classes, with Book and Cancel.
export default function TimetablePage() {
  const [classes, setClasses] = useState<GymClass[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState("")
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let ignore = false
    listClasses(0, true)
      .then((page) => {
        if (ignore) return
        setClasses(page.items)
        setTotal(page.total)
      })
      .catch((err) => !ignore && setError(errorText(err)))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [reloadKey])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const page = await listClasses(classes.length, true)
      setClasses((prev) => [...prev, ...page.items])
      setTotal(page.total)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoadingMore(false)
    }
  }

  // Update the one class on screen right away: one more or one fewer booking, and whether it is mine.
  function handleBooked(id: number, booked: boolean) {
    setClasses((prev) =>
      prev.map((c) => (c.id === id ? { ...c, is_booked_by_me: booked, booked_count: c.booked_count + (booked ? 1 : -1) } : c)),
    )
  }

  let body
  if (loading) body = <p className="empty">Loading classes…</p>
  else if (error) body = <p className="error">{error}</p>
  else if (classes.length === 0) body = <p className="empty">No upcoming classes right now.</p>
  else
    body = (
      <ul className="class-list">
        {classes.map((c) => (
          <TimetableItem key={c.id} gymClass={c} onBooked={handleBooked} onRefused={() => setReloadKey((k) => k + 1)} />
        ))}
      </ul>
    )

  return (
    <section className="card narrow-wide" aria-labelledby="timetable-heading">
      <h2 id="timetable-heading">Classes</h2>
      <p className="hint">Book a place in an upcoming class. You need a valid membership, and you can cancel any time.</p>
      {body}
      {!loading && classes.length > 0 && (
        <div className="list-foot">
          <span>
            Showing {classes.length} of {total}
          </span>
          {classes.length < total && (
            <button onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
