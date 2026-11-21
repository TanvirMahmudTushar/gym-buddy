import { useEffect, useState } from "react"
import ClassBookings from "../../components/ClassBookings"
import { listMyClasses } from "../../services/trainerService"
import type { BookingWhen, GymClass } from "../../types/gymClass"
import { formatClassTime } from "../../utils/gymClass"
import { errorText } from "../../utils/member"

const PAGE_SIZE = 20

function MyClassItem({ gymClass: c, open }: { gymClass: GymClass; open: boolean }) {
  const [showBookings, setShowBookings] = useState(open)
  const full = c.booked_count >= c.capacity

  return (
    <li className="class-item">
      <div className="toolbar">
        <h3>{c.name}</h3>
        <span className={full ? "pill expired" : "pill active"}>
          {c.booked_count} / {c.capacity} booked
        </span>
      </div>
      <p className="hint">
        {formatClassTime(c.starts_at)} · {c.duration_minutes} min
      </p>
      {c.description && <p>{c.description}</p>}
      <div className="actions">
        <button type="button" onClick={() => setShowBookings((v) => !v)} aria-expanded={showBookings}>
          {showBookings ? "Hide who booked" : "Who booked"}
        </button>
      </div>
      {showBookings && <ClassBookings classId={c.id} linkMembers={false} />}
    </li>
  )
}

// Trainers: the classes they teach and who booked each one. Upcoming classes first; past ones on request.
export default function MyClassesPage() {
  const [when, setWhen] = useState<BookingWhen>("upcoming")
  const [classes, setClasses] = useState<GymClass[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let ignore = false
    setLoading(true)
    setError("")
    listMyClasses(when, 0, PAGE_SIZE)
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
  }, [when])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const page = await listMyClasses(when, classes.length, PAGE_SIZE)
      setClasses((prev) => [...prev, ...page.items])
      setTotal(page.total)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoadingMore(false)
    }
  }

  let body
  if (loading) body = <p className="empty">Loading your classes…</p>
  else if (error) body = <p className="error">{error}</p>
  else if (classes.length === 0)
    body = (
      <p className="empty">
        {when === "upcoming" ? "You have no upcoming classes. A Gym Manager picks the trainer for each class." : "No past classes yet."}
      </p>
    )
  else
    body = (
      <ul className="class-list">
        {classes.map((c, i) => (
          // The next class opens with its bookings showing; the key includes `when` so switching lists starts fresh.
          <MyClassItem key={`${when}-${c.id}`} gymClass={c} open={when === "upcoming" && i === 0} />
        ))}
      </ul>
    )

  return (
    <section className="card narrow-wide" aria-labelledby="my-classes-heading">
      <div className="toolbar">
        <h2 id="my-classes-heading">My classes</h2>
        <div className="chips" role="group" aria-label="Which classes to show">
          {(["upcoming", "past"] as const).map((w) => (
            <button key={w} type="button" className="chip" aria-pressed={when === w} onClick={() => setWhen(w)}>
              {w === "upcoming" ? "Upcoming" : "Past"}
            </button>
          ))}
        </div>
      </div>
      <p className="hint">
        The classes you teach, with who booked each one. Upcoming classes are soonest first; past classes latest first.
      </p>
      {body}
      {!loading && classes.length > 0 && (
        <div className="list-foot">
          <span>
            Showing {classes.length} of {total} {total === 1 ? "class" : "classes"}
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
