import { useCallback, useEffect, useMemo, useState } from "react"
import Alert from "../../components/Alert"
import ListState from "../../components/ListState"
import PageHeader from "../../components/PageHeader"
import Pager from "../../components/Pager"
import QuickCheckIn from "../../components/QuickCheckIn"
import { useDebouncedValue } from "../../hooks/useDebouncedValue"
import { usePagedList } from "../../hooks/usePagedList"
import { useSave } from "../../hooks/useSave"
import { checkOut, listCheckIns } from "../../services/checkInService"
import type { CheckIn } from "../../types/checkIn"
import { hashParams } from "../../utils/hash"
import { membersLink } from "../../utils/member"
import { formatTime, gymToday } from "../../utils/time"

const insideFromHash = () => hashParams().get("inside") === "1"

/** "1 h 25 min" between checking in and out. */
function stay(visit: CheckIn): string {
  if (!visit.checked_out_at) return ""
  const minutes = Math.max(0, Math.round((Date.parse(visit.checked_out_at) - Date.parse(visit.checked_in_at)) / 60_000))
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

// The front desk's attendance screen: check members in and out, see who is inside, and look up any day.
export default function AttendancePage() {
  const [day, setDay] = useState(gymToday)
  // #/attendance?inside=1 (from the Dashboard) opens on who is in the gym now.
  const [inside, setInside] = useState(insideFromHash)
  // The menu link, followed while this page is open, shows everyone again.
  useEffect(() => {
    const onChange = () => setInside(insideFromHash())
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [])
  const [search, setSearch] = useState("")
  const q = useDebouncedValue(search)
  const [reloadKey, setReloadKey] = useState(0)
  const { saving, error, run } = useSave()

  const isToday = day === gymToday()
  const filters = useMemo(() => ({ day, inside: inside && isToday, q }), [day, inside, isToday, q])
  const list = usePagedList(listCheckIns, filters, reloadKey)
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  const leave = (visit: CheckIn) =>
    run(async () => {
      await checkOut(visit.id)
      reload()
    })

  const empty = q
    ? "No visit matches this search."
    : filters.inside
      ? "Nobody is in the gym right now."
      : isToday
        ? "Nobody has checked in today yet."
        : "Nobody checked in on this day."

  return (
    <div className="page">
      <PageHeader title="Attendance" subtitle="Check members in when they arrive and out when they leave." />
      <QuickCheckIn onCheckedIn={reload} />
      <section className="card">
        <div className="toolbar">
          <h2>
            {isToday ? "Today" : "Visits"} {list.total > 0 && <span className="hint">({list.total})</span>}
          </h2>
          <div className="chips" role="group" aria-label="Which visits to show">
            <button type="button" className="chip" aria-pressed={!filters.inside} onClick={() => setInside(false)}>
              Everyone
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={filters.inside}
              onClick={() => {
                setDay(gymToday())
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
            <input id="attendance-day" type="date" value={day} max={gymToday()} onChange={(e) => setDay(e.target.value || gymToday())} />
          </div>
          <div className="field grow">
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
        <Alert>{error}</Alert>
        <ListState loading={list.loading} error={list.error} isEmpty={list.items.length === 0} empty={empty}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Stayed</th>
                  <th>Recorded by</th>
                  <th className="act">
                    <span className="visually-hidden">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((v) => (
                  <tr key={v.id}>
                    <td className="name">
                      <a href={membersLink({ member: v.member_id })}>{v.member_name}</a>
                    </td>
                    <td data-label="In">{formatTime(v.checked_in_at)}</td>
                    <td data-label="Out">
                      {v.checked_out_at ? formatTime(v.checked_out_at) : isToday ? <span className="pill good">In the gym</span> : "Not recorded"}
                    </td>
                    <td data-label="Stayed">{stay(v) || "—"}</td>
                    <td data-label="Recorded by">{v.recorded_by_name ?? "—"}</td>
                    <td className="act">
                      {!v.checked_out_at && isToday && (
                        <div className="actions">
                          <button type="button" className="small" onClick={() => leave(v)} disabled={saving}>
                            Check out
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager {...list} onChange={list.goTo} />
        </ListState>
      </section>
    </div>
  )
}
