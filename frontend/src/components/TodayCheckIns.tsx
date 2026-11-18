import { useEffect, useState } from "react"
import { listTodayCheckIns } from "../services/checkInService"
import type { CheckIn } from "../types/checkIn"
import { errorText, formatTime } from "../utils/member"

interface Props {
  /** Changes whenever the list should reload (a check-in was recorded, or members were deleted). */
  refreshKey: number
  onSelect: (memberId: number) => void
}

// Who has arrived today, newest first. Click a name to open that member.
export default function TodayCheckIns({ refreshKey, onSelect }: Props) {
  const [visits, setVisits] = useState<CheckIn[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let ignore = false
    setError("")
    listTodayCheckIns()
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
  }, [refreshKey])

  return (
    <section className="card" aria-labelledby="today-heading">
      <div className="toolbar">
        <h2 id="today-heading">Checked in today</h2>
        <span className="hint">{loading ? "Loading…" : `${total} ${total === 1 ? "visit" : "visits"}`}</span>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && visits.length === 0 && <p className="empty">Nobody has checked in yet today.</p>}
      {visits.length > 0 && (
        <ul className="today-list">
          {visits.map((v) => (
            <li key={v.id}>
              <button type="button" className="linklike" onClick={() => onSelect(v.member_id)}>
                {v.member_name}
              </button>
              <span className="hint">{formatTime(v.checked_in_at)}</span>
            </li>
          ))}
        </ul>
      )}
      {total > visits.length && <p className="hint">Showing the latest {visits.length} of {total}.</p>}
    </section>
  )
}
