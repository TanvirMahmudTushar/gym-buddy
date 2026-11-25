import { useEffect, useState } from "react"
import Alert from "../../components/Alert"
import ExportButton from "../../components/ExportButton"
import ListState from "../../components/ListState"
import PageHeader from "../../components/PageHeader"
import Pager from "../../components/Pager"
import { useDebouncedValue } from "../../hooks/useDebouncedValue"
import { usePagedList } from "../../hooks/usePagedList"
import { exportActivityCsv, listActivity } from "../../services/activityService"
import type { ActivityEntry, ActivityEvent, ActivityFilters } from "../../types/activity"
import { EVENTS, NO_ACTIVITY_FILTERS, activityLink, eventLabel, eventPill } from "../../utils/activity"
import { hashDay, hashId, hashParams, replaceHash } from "../../utils/hash"
import { describeBrowser } from "../../utils/session"
import { count } from "../../utils/text"
import { formatDateTime } from "../../utils/time"

// The CSV holds at most this many rows (backend EXPORT_LIMIT).
const EXPORT_LIMIT = 10_000

/** The filters named in the address (#/activity?event=login_failed&q=192.0.2.66), so the Security page can link here. */
function filtersFromHash(): ActivityFilters {
  const params = hashParams()
  return {
    event: EVENTS.find((e) => e.value === params.get("event"))?.value ?? "",
    user_id: hashId("user"),
    date_from: hashDay("from"),
    date_to: hashDay("to"),
    q: (params.get("q") ?? "").slice(0, 100),
  }
}

/** The email shown for the user filter: from a row that names that account, or its id. */
function userLabel(id: number, entries: ActivityEntry[]): string {
  for (const e of entries) {
    if (e.actor_id === id && e.actor_email) return e.actor_email
    if (e.target_id === id && e.target_email) return e.target_email
  }
  return `account #${id}`
}

// Admins only: every security event, newest first, with filters and a CSV of the matching rows.
export default function ActivityPage() {
  // What the filter boxes show, and (once the typing pauses) what the list is loaded with.
  const [draft, setDraft] = useState<ActivityFilters>(filtersFromHash)
  const filters = useDebouncedValue(draft)
  const list = usePagedList(listActivity, filters)
  const [exportError, setExportError] = useState("")

  // Keep the filters in the address, so a reload or a shared link shows the same rows.
  useEffect(() => replaceHash(activityLink(filters)), [filters])

  // The menu link, followed while this page is open, clears them.
  useEffect(() => {
    const onChange = () => setDraft(filtersFromHash())
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [])

  /** An email in the table: a button that shows only that account's activity, or plain text with no account. */
  function account(id: number | null, email: string | null, empty: string) {
    if (!email) return <span className="hint">{empty}</span>
    if (id === null) return email
    return (
      <button type="button" className="linklike" title="Show only this account's activity" onClick={() => setDraft({ ...draft, user_id: id })}>
        {email}
      </button>
    )
  }

  return (
    <div className="page">
      <PageHeader title="Activity log" subtitle="Who did what, to which account, from where and when. Passwords and tokens are never recorded.">
        <ExportButton name="activity" load={() => exportActivityCsv(filters)} disabled={list.total === 0} onError={setExportError} />
      </PageHeader>
      <section className="card">
        <div className="filters">
          <div className="field">
            <label htmlFor="activity-event">Event</label>
            <select id="activity-event" value={draft.event} onChange={(e) => setDraft({ ...draft, event: e.target.value as ActivityEvent | "" })}>
              <option value="">Any</option>
              {EVENTS.map((ev) => (
                <option key={ev.value} value={ev.value}>
                  {ev.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="activity-from">From</label>
            <input id="activity-from" type="date" max={draft.date_to || undefined} value={draft.date_from} onChange={(e) => setDraft({ ...draft, date_from: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="activity-to">To</label>
            <input id="activity-to" type="date" min={draft.date_from || undefined} value={draft.date_to} onChange={(e) => setDraft({ ...draft, date_to: e.target.value })} />
          </div>
          <div className="field grow">
            <label htmlFor="activity-q">Search</label>
            <input id="activity-q" type="search" value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} maxLength={100} placeholder="Email, IP address or details" autoComplete="off" />
          </div>
          <button type="button" onClick={() => setDraft(NO_ACTIVITY_FILTERS)}>
            Clear
          </button>
        </div>
        {filters.user_id && (
          <Alert kind="info">
            Only activity by or about <strong>{userLabel(filters.user_id, list.items)}</strong>.{" "}
            <button type="button" className="linklike" onClick={() => setDraft({ ...draft, user_id: null })}>
              Show everyone
            </button>
          </Alert>
        )}
        {list.total > EXPORT_LIMIT && (
          <p className="hint">The CSV holds the newest {EXPORT_LIMIT.toLocaleString("en-US")} rows of {count(list.total, "event")}; narrow the dates to export older ones.</p>
        )}
        <Alert>{exportError}</Alert>
        <ListState loading={list.loading} error={list.error} isEmpty={list.items.length === 0} empty="No activity matches these filters.">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Time</th>
                  <th>Who</th>
                  <th>Account affected</th>
                  <th>Details</th>
                  <th>From</th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((e) => (
                  <tr key={e.id}>
                    <td className="name">
                      <span className={eventPill(e.event)}>{eventLabel(e.event)}</span>
                    </td>
                    <td data-label="Time">{formatDateTime(e.created_at)}</td>
                    {/* No actor: the server did it (a lockout, or a session ended for a reused refresh token). */}
                    <td data-label="Who">{account(e.actor_id, e.actor_email, "System")}</td>
                    <td data-label="Affected">{account(e.target_id, e.target_email, "—")}</td>
                    <td data-label="Details">{e.details ?? "—"}</td>
                    <td data-label="From" title={e.user_agent ?? undefined}>
                      <span>
                        {e.ip ? (
                          <button type="button" className="linklike" title="Show everything from this address" onClick={() => setDraft({ ...NO_ACTIVITY_FILTERS, q: e.ip ?? "" })}>
                            {e.ip}
                          </button>
                        ) : (
                          "Unknown"
                        )}
                        <span className="hint">{describeBrowser(e.user_agent)}</span>
                      </span>
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
