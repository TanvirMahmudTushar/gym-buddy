import Alert from "../../components/Alert"
import ClassSummary from "../../components/ClassSummary"
import ListState from "../../components/ListState"
import PageHeader from "../../components/PageHeader"
import Pager from "../../components/Pager"
import { usePagedList } from "../../hooks/usePagedList"
import { useSave } from "../../hooks/useSave"
import { bookClass, cancelBooking, listClasses } from "../../services/classService"
import type { GymClass } from "../../types/gymClass"

const load = (_filters: null, offset: number) => listClasses(offset, true)

interface ItemProps {
  gymClass: GymClass
  /** Called when the class changed, with its new booking state. */
  onBooked: (id: number, booked: boolean) => void
}

function TimetableItem({ gymClass: c, onBooked }: ItemProps) {
  const { saving, error, run } = useSave()
  const full = c.booked_count >= c.capacity

  const toggle = () =>
    run(async () => {
      await (c.is_booked_by_me ? cancelBooking(c.id) : bookClass(c.id))
      onBooked(c.id, !c.is_booked_by_me)
    })

  return (
    <li className="item">
      <ClassSummary gymClass={c} />
      <Alert>{error}</Alert>
      <div className="actions">
        {c.is_booked_by_me ? (
          <>
            <button type="button" className="small" onClick={toggle} disabled={saving}>
              {saving ? "Cancelling…" : "Cancel booking"}
            </button>
            <span className="pill good">You are booked</span>
          </>
        ) : (
          <button type="button" className="small primary" onClick={toggle} disabled={saving || full}>
            {saving ? "Booking…" : full ? "Class full" : "Book"}
          </button>
        )}
      </div>
    </li>
  )
}

// A User's view of the timetable: upcoming classes, with Book and Cancel.
export default function TimetablePage() {
  const list = usePagedList(load, null)

  // Update the one class on screen right away: one more or one fewer booking, and whether it is mine.
  const handleBooked = (id: number, booked: boolean) =>
    list.replace((items) =>
      items.map((c) => (c.id === id ? { ...c, is_booked_by_me: booked, booked_count: c.booked_count + (booked ? 1 : -1) } : c)),
    )

  return (
    <div className="page">
      <PageHeader title="Book a class" subtitle="You need a valid membership, and you can cancel until the class starts." />
      <ListState loading={list.loading} error={list.error} isEmpty={list.items.length === 0} empty="No upcoming classes right now.">
        <ul className="card-grid">
          {list.items.map((c) => (
            <TimetableItem key={c.id} gymClass={c} onBooked={handleBooked} />
          ))}
        </ul>
        <Pager {...list} onChange={list.goTo} />
      </ListState>
    </div>
  )
}
