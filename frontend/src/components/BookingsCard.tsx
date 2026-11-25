import { type ReactNode, useState } from "react"
import { useSave } from "../hooks/useSave"
import { useShowMore } from "../hooks/useShowMore"
import type { BookedClass, BookedClassPage, BookingWhen } from "../types/gymClass"
import { formatClassTime } from "../utils/time"
import Alert from "./Alert"
import BookingRow from "./BookingRow"
import ListState from "./ListState"
import ShowMore from "./ShowMore"

const PAGE_SIZE = 5

interface Props {
  title: string
  /** Fetches one page of the member's bookings. */
  load: (when: BookingWhen, offset: number, limit: number) => Promise<BookedClassPage>
  /** Cancels the member's booking for this class. */
  cancel: (classId: number) => Promise<void>
  emptyText: ReactNode
}

// A member's class bookings, upcoming (with Cancel) or past. Used on the member's page (staff) and on My membership (the
// member themself), each with its own load and cancel.
export default function BookingsCard({ title, load, cancel, emptyText }: Props) {
  const [when, setWhen] = useState<BookingWhen>("upcoming")
  const list = useShowMore<BookedClass>((offset) => load(when, offset, PAGE_SIZE), when)
  const { saving, error, run } = useSave()
  const [message, setMessage] = useState("")

  const handleCancel = (b: BookedClass) =>
    run(async () => {
      setMessage("")
      await cancel(b.class_id)
      list.setItems((prev) => prev.filter((x) => x.class_id !== b.class_id))
      list.setTotal((n) => n - 1)
      setMessage(`The booking for ${b.class_name} on ${formatClassTime(b.starts_at)} is cancelled.`)
    })

  return (
    <section className="card">
      <div className="toolbar">
        <h2>
          {title} {list.total > 0 && <span className="hint">({list.total})</span>}
        </h2>
        <div className="chips" role="group" aria-label="Which bookings to show">
          {(["upcoming", "past"] as const).map((w) => (
            <button key={w} type="button" className="chip" aria-pressed={when === w} onClick={() => setWhen(w)}>
              {w === "upcoming" ? "Upcoming" : "Past"}
            </button>
          ))}
        </div>
      </div>
      <Alert kind="success">{message}</Alert>
      <Alert>{error}</Alert>
      <ListState loading={list.loading} error={list.error} isEmpty={list.items.length === 0} empty={when === "upcoming" ? emptyText : "No past bookings."}>
        <ul className="rows">
          {list.items.map((b) => (
            <BookingRow key={b.class_id} booking={b}>
              {when === "upcoming" && (
                <button type="button" className="small" onClick={() => handleCancel(b)} disabled={saving}>
                  Cancel
                </button>
              )}
            </BookingRow>
          ))}
        </ul>
      </ListState>
      <ShowMore shown={list.items.length} total={list.total} loading={list.loadingMore} onClick={list.showMore} />
    </section>
  )
}
