import { type ReactNode, useEffect, useState } from "react"
import type { BookedClass, BookedClassPage, BookingWhen } from "../types/gymClass"
import { formatClassTime } from "../utils/gymClass"
import { errorText } from "../utils/member"

const PAGE_SIZE = 5

interface Props {
  /** "panel": a section inside the member details; "card": a card of its own (My membership). */
  variant: "panel" | "card"
  title: string
  /** Fetches one page of the member's bookings. */
  load: (when: BookingWhen, offset: number, limit: number) => Promise<BookedClassPage>
  /** Cancels the member's booking for this class. */
  cancel: (classId: number) => Promise<void>
  emptyText: string
  /** Shown under the list, such as a link to book a class. */
  footer?: ReactNode
  /** Called after a booking is cancelled. */
  onCancelled?: () => void
}

function BookingLine({ booking: b, action }: { booking: BookedClass; action?: ReactNode }) {
  return (
    <li>
      <span className="wrap-text">
        <strong>{b.class_name}</strong>{" "}
        <span className="hint">
          · {formatClassTime(b.starts_at)} · {b.duration_minutes} min{b.trainer_name ? ` · ${b.trainer_name}` : ""}
        </span>
      </span>
      {action}
      {b.attended !== null && <span className={b.attended ? "pill active" : "pill expired"}>{b.attended ? "Attended" : "Missed"}</span>}
    </li>
  )
}

// A member's class bookings: upcoming ones with Cancel, and past ones on request. Used in the member details (staff)
// and on My membership (the member themself), each with its own load and cancel.
export default function BookingsSection({ variant, title, load, cancel, emptyText, footer, onCancelled }: Props) {
  const [upcoming, setUpcoming] = useState<BookedClass[]>([])
  const [upcomingTotal, setUpcomingTotal] = useState(0)
  const [past, setPast] = useState<BookedClass[] | null>(null)
  const [pastTotal, setPastTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | "more" | "past" | null>(null)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  // Loads once: the parent remounts this section for each member (key), so `load` never needs to be watched.
  useEffect(() => {
    let ignore = false
    load("upcoming", 0, PAGE_SIZE)
      .then((page) => {
        if (ignore) return
        setUpcoming(page.items)
        setUpcomingTotal(page.total)
      })
      .catch((err) => !ignore && setError(errorText(err)))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see the comment above
  }, [])

  async function run(key: number | "more" | "past", action: () => Promise<void>) {
    setBusy(key)
    setError("")
    setMessage("")
    try {
      await action()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  const handleCancel = (b: BookedClass) =>
    run(b.class_id, async () => {
      await cancel(b.class_id)
      setUpcoming((prev) => prev.filter((x) => x.class_id !== b.class_id))
      setUpcomingTotal((n) => n - 1)
      setMessage(`Booking for ${b.class_name} on ${formatClassTime(b.starts_at)} cancelled.`)
      onCancelled?.()
    })

  const showMoreUpcoming = () =>
    run("more", async () => {
      const page = await load("upcoming", upcoming.length, PAGE_SIZE)
      setUpcoming((prev) => [...prev, ...page.items])
      setUpcomingTotal(page.total)
    })

  const showPast = () =>
    run("past", async () => {
      const page = await load("past", past?.length ?? 0, PAGE_SIZE)
      setPast((prev) => [...(prev ?? []), ...page.items])
      setPastTotal(page.total)
    })

  const id = `bookings-${title.replace(/\W+/g, "-").toLowerCase()}`
  const Heading = variant === "card" ? "h2" : "h3"
  return (
    <section className={variant === "card" ? "card" : "visits"} aria-labelledby={id}>
      <Heading id={id}>
        {title} {upcomingTotal > 0 && <span className="hint">({upcomingTotal} upcoming)</span>}
      </Heading>
      {loading ? (
        <p className="empty">Loading bookings…</p>
      ) : upcoming.length === 0 ? (
        !error && <p className="empty">{emptyText}</p>
      ) : (
        <ul className="visit-list">
          {upcoming.map((b) => (
            <BookingLine
              key={b.class_id}
              booking={b}
              action={
                <button type="button" onClick={() => handleCancel(b)} disabled={busy !== null}>
                  {busy === b.class_id ? "Cancelling…" : "Cancel"}
                </button>
              }
            />
          ))}
        </ul>
      )}
      {upcoming.length < upcomingTotal && (
        <button type="button" onClick={showMoreUpcoming} disabled={busy !== null}>
          {busy === "more" ? "Loading…" : "Show more upcoming"}
        </button>
      )}
      {message && (
        <p className="hint" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {past && (
        <>
          <h4 className="subhead">Past classes</h4>
          {past.length === 0 ? (
            <p className="empty">No past bookings.</p>
          ) : (
            <ul className="visit-list">
              {past.map((b) => (
                <BookingLine key={b.class_id} booking={b} />
              ))}
            </ul>
          )}
        </>
      )}
      {(past === null || past.length < pastTotal) && !loading && (
        <button type="button" onClick={showPast} disabled={busy !== null}>
          {busy === "past" ? "Loading…" : past === null ? "Show past bookings" : "Show older"}
        </button>
      )}
      {footer}
    </section>
  )
}
