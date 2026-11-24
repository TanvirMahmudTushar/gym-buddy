import { useEffect, useState } from "react"
import { checkOut, listMemberCheckIns, recordCheckIn } from "../services/checkInService"
import type { CheckIn } from "../types/checkIn"
import type { Member } from "../types/member"
import { errorText, formatDateTime, formatTime, memberStatus, todayUtc } from "../utils/member"

const PAGE_SIZE = 5

// The Check in / Check out button and the visit history inside the member details panel.
export default function CheckInSection({ member }: { member: Member }) {
  const [visits, setVisits] = useState<CheckIn[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const status = memberStatus(member)
  // The newest visit, if it is from today (UTC) and still open: the member is inside.
  const open = visits.find((v) => v.checked_out_at === null && v.checked_in_at.slice(0, 10) === todayUtc())

  // The panel remounts this section for each member (key), so this runs once per member.
  useEffect(() => {
    let ignore = false
    listMemberCheckIns(member.id, 0, PAGE_SIZE)
      .then((page) => {
        if (ignore) return
        setVisits(page.items)
        setTotal(page.total)
      })
      .catch((err) => !ignore && setError(errorText(err)))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [member.id])

  async function checkIn() {
    setBusy(true)
    setError("")
    setMessage("")
    try {
      const visit = await recordCheckIn(member.id)
      setVisits((prev) => [visit, ...prev])
      setTotal((n) => n + 1)
      setMessage(`${member.name} checked in at ${formatTime(visit.checked_in_at)}.`)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function leave(visit: CheckIn) {
    setBusy(true)
    setError("")
    setMessage("")
    try {
      const closed = await checkOut(visit.id)
      setVisits((prev) => prev.map((v) => (v.id === closed.id ? closed : v)))
      setMessage(`${member.name} checked out.`)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function showMore() {
    setLoadingMore(true)
    try {
      const page = await listMemberCheckIns(member.id, visits.length, PAGE_SIZE)
      setVisits((prev) => [...prev, ...page.items])
      setTotal(page.total)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <section aria-labelledby="visits-heading" className="visits">
      <div className="toolbar">
        <h3 id="visits-heading">Visits {total > 0 && <span className="hint">({total})</span>}</h3>
        {open ? (
          <button type="button" onClick={() => leave(open)} disabled={busy}>
            {busy ? "Checking out…" : "Check out"}
          </button>
        ) : (
          <button type="button" className="primary" onClick={checkIn} disabled={busy || loading || status !== "active"}>
            {busy ? "Checking in…" : "Check in"}
          </button>
        )}
      </div>
      {status === "frozen" && <p className="hint">Frozen members cannot check in. Unfreeze the membership first.</p>}
      {status === "expired" && <p className="hint">This membership has expired. Renew it to check them in.</p>}
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
      {loading ? (
        <p className="empty">Loading visits…</p>
      ) : visits.length === 0 ? (
        <p className="empty">No visits yet.</p>
      ) : (
        <ul className="visit-list">
          {visits.map((v) => (
            <li key={v.id}>
              <span>
                {formatDateTime(v.checked_in_at)}
                {v.checked_out_at && ` to ${formatTime(v.checked_out_at)}`}
              </span>
              {v.recorded_by_name && <span className="hint">by {v.recorded_by_name}</span>}
            </li>
          ))}
        </ul>
      )}
      {visits.length < total && (
        <button type="button" onClick={showMore} disabled={loadingMore}>
          {loadingMore ? "Loading…" : "Show older visits"}
        </button>
      )}
    </section>
  )
}
