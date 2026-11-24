import { useCallback, useEffect, useMemo, useState } from "react"
import QuickCheckIn from "../../components/QuickCheckIn"
import { useDebouncedValue } from "../../hooks/useDebouncedValue"
import { usePagedList } from "../../hooks/usePagedList"
import { checkOut, listCheckIns } from "../../services/checkInService"
import type { CheckIn } from "../../types/checkIn"
import { errorText, formatTime, hashParams, membersLink, todayUtc } from "../../utils/member"

/** "1 h 25 min" between checking in and out. */
function stay(visit: CheckIn): string {
  if (!visit.checked_out_at) return ""
  const minutes = Math.max(0, Math.round((Date.parse(visit.checked_out_at) - Date.parse(visit.checked_in_at)) / 60_000))
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

// The front desk's attendance screen: check members in and out, see who is inside, and look up any day.
export default function AttendancePage() {
  const [day, setDay] = useState(todayUtc)
  // #/attendance?inside=1 (from the Dashboard) opens on who is in the gym now.
  const [inside, setInside] = useState(() => hashParams().get("inside") === "1")
  const [search, setSearch] = useState("")
  const q = useDebouncedValue(search)
  const [reloadKey, setReloadKey] = useState(0)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [actionError, setActionError] = useState("")

  const isToday = day === todayUtc()
  const filters = useMemo(() => ({ day, inside: inside && isToday, q }), [day, inside, isToday, q])
  const list = usePagedList(listCheckIns, filters, reloadKey)
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    window.history.replaceState(null, "", inside && isToday ? "#/attendance?inside=1" : "#/attendance")
  }, [inside, isToday])

  async function leave(visit: CheckIn) {
    setBusyId(visit.id)
    setActionError("")
    try {
      await checkOut(visit.id)
      reload()
    } catch (err) {
      setActionError(errorText(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="column">
      <QuickCheckIn onCheckedIn={reload} />
      <section className="card" aria-labelledby="attendance-heading">
        <div className="toolbar">
          <h2 id="attendance-heading">Attendance {list.total > 0 && <span className="hint">({list.total})</span>}</h2>
          <div className="chips" role="group" aria-label="Which visits to show">
            <button type="button" className="chip" aria-pressed={!filters.inside} onClick={() => setInside(false)}>
              Everyone
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={filters.inside}
              onClick={() => {
                setDay(todayUtc())
                setInside(true)
              }}
            >
              In the gym now
            </button>
          </div>
        </div>
        <div className="filters">
          <div className="field">
            <label htmlFor="attendance-day">Day</label>
            <input id="attendance-day" type="date" value={day} max={todayUtc()} onChange={(e) => setDay(e.target.value || todayUtc())} />
          </div>
          <div className="field">
            <label htmlFor="attendance-q">Member</label>
            <input
              id="attendance-q"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={100}
              placeholder="Name, email or phone"
              autoComplete="off"
            />
          </div>
        </div>
        {(list.error || actionError) && (
          <p className="error" role="alert">
            {list.error || actionError}
          </p>
        )}
        {list.loading && list.items.length === 0 ? (
          <p className="empty">Loading visits…</p>
        ) : list.items.length === 0 ? (
          <p className="empty">
            {q ? "No visit matches this search." : filters.inside ? "Nobody is in the gym right now." : isToday ? "Nobody has checked in today yet." : "Nobody checked in on this day."}
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Recorded by</th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((v) => (
                  <tr key={v.id}>
                    <td className="name">
                      <a href={membersLink({ member: v.member_id })}>{v.member_name}</a>
                    </td>
                    <td>{formatTime(v.checked_in_at)}</td>
                    <td>
                      {v.checked_out_at ? (
                        <>
                          {formatTime(v.checked_out_at)} <span className="hint">({stay(v)})</span>
                        </>
                      ) : isToday ? (
                        <button type="button" onClick={() => leave(v)} disabled={busyId !== null}>
                          {busyId === v.id ? "Checking out…" : "Check out"}
                        </button>
                      ) : (
                        <span className="hint">Not recorded</span>
                      )}
                    </td>
                    <td>{v.recorded_by_name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint">Times are in your local time; a day is a UTC day.</p>
        {list.items.length > 0 && (
          <div className="list-foot">
            <span>
              Showing {list.items.length} of {list.total}
            </span>
            {list.items.length < list.total && (
              <button onClick={list.loadMore} disabled={list.loadingMore}>
                {list.loadingMore ? "Loading…" : "Load more"}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
