import { useState } from "react"
import { useSave } from "../hooks/useSave"
import { useShowMore } from "../hooks/useShowMore"
import { checkOut, listMemberCheckIns, recordCheckIn } from "../services/checkInService"
import type { CheckIn } from "../types/checkIn"
import type { Member } from "../types/member"
import { memberStatus } from "../utils/member"
import { formatTime, gymDay, gymToday } from "../utils/time"
import Alert from "./Alert"
import ListState from "./ListState"
import ShowMore from "./ShowMore"
import VisitRow from "./VisitRow"

const PAGE_SIZE = 5

// A member's visits, with Check in or Check out.
export default function CheckInCard({ member }: { member: Member }) {
  const list = useShowMore<CheckIn>((offset) => listMemberCheckIns(member.id, offset, PAGE_SIZE))
  const { saving, error, run } = useSave()
  const [message, setMessage] = useState("")

  const status = memberStatus(member)
  // The newest visit, if it is from today and still open: the member is inside.
  const open = list.items.find((v) => v.checked_out_at === null && gymDay(v.checked_in_at) === gymToday())

  const checkIn = () =>
    run(async () => {
      setMessage("")
      const visit = await recordCheckIn(member.id)
      list.setItems((prev) => [visit, ...prev])
      list.setTotal((n) => n + 1)
      setMessage(`Checked in at ${formatTime(visit.checked_in_at)}.`)
    })

  const leave = (visit: CheckIn) =>
    run(async () => {
      setMessage("")
      const closed = await checkOut(visit.id)
      list.setItems((prev) => prev.map((v) => (v.id === closed.id ? closed : v)))
      setMessage("Checked out.")
    })

  return (
    <section className="card">
      <div className="toolbar">
        <h2>Visits {list.total > 0 && <span className="hint">({list.total})</span>}</h2>
        {open ? (
          <button type="button" className="small" onClick={() => leave(open)} disabled={saving}>
            {saving ? "Checking out…" : "Check out"}
          </button>
        ) : (
          <button type="button" className="small primary" onClick={checkIn} disabled={saving || list.loading || status !== "active"}>
            {saving ? "Checking in…" : "Check in"}
          </button>
        )}
      </div>
      {status === "frozen" && <p className="hint">Frozen members cannot check in. Unfreeze the membership first.</p>}
      {status === "expired" && <p className="hint">This membership has expired. Renew it to check them in.</p>}
      <Alert kind="success">{message}</Alert>
      <Alert>{error}</Alert>
      <ListState loading={list.loading} error={list.error} isEmpty={list.items.length === 0} empty="No visits yet.">
        <ul className="rows">
          {list.items.map((v) => (
            <VisitRow key={v.id} visit={v} showRecorder />
          ))}
        </ul>
      </ListState>
      <ShowMore shown={list.items.length} total={list.total} loading={list.loadingMore} onClick={list.showMore} />
    </section>
  )
}
