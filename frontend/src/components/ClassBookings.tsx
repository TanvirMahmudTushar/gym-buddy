import { useState } from "react"
import { useSave } from "../hooks/useSave"
import { useShowMore } from "../hooks/useShowMore"
import { listBookings, markAttendance } from "../services/classService"
import type { Booking } from "../types/gymClass"
import { membersLink } from "../utils/member"
import { formatDateTime } from "../utils/time"
import Alert from "./Alert"
import ListState from "./ListState"
import ShowMore from "./ShowMore"

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
  const list = useShowMore<Booking>((offset) => listBookings(classId, offset))
  const { saving, error, run } = useSave()
  const [canMark] = useState(() => Date.parse(startsAt) - OPENS_MS <= Date.now())

  /** Pressing the mark a person already has clears it. */
  const mark = (b: Booking, attended: boolean) =>
    run(async () => {
      const saved = await markAttendance(classId, b.member_id, b.attended === attended ? null : attended)
      list.setItems((prev) => prev.map((x) => (x.member_id === saved.member_id ? saved : x)))
    })

  return (
    <>
      <Alert>{error}</Alert>
      {!canMark && <p className="hint">Attendance can be marked from one hour before the class starts.</p>}
      <ListState loading={list.loading} error={list.error} isEmpty={list.items.length === 0} empty="Nobody has booked this class.">
        <ul className="rows">
          {list.items.map((b) => (
            <li key={b.member_id}>
              <span>
                <span className="row-title">{linkMembers ? <a href={membersLink({ member: b.member_id })}>{b.member_name}</a> : b.member_name}</span>
                <span className="hint">Booked {formatDateTime(b.booked_at)}</span>
              </span>
              {canMark && (
                <span className="chips" role="group" aria-label={`Attendance of ${b.member_name}`}>
                  <button type="button" className="chip" aria-pressed={b.attended === true} onClick={() => mark(b, true)} disabled={saving}>
                    Came
                  </button>
                  <button type="button" className="chip" aria-pressed={b.attended === false} onClick={() => mark(b, false)} disabled={saving}>
                    Missed
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </ListState>
      <ShowMore shown={list.items.length} total={list.total} loading={list.loadingMore} onClick={list.showMore} />
    </>
  )
}
