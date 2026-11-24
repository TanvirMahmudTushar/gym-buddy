import { type FormEvent, useEffect, useState } from "react"
import SecurityTabs from "../../components/SecurityTabs"
import { exportActivityCsv, listActivity } from "../../services/activityService"
import type { ActivityEntry, ActivityEvent, ActivityFilters } from "../../types/activity"
import { EVENTS, NO_ACTIVITY_FILTERS, activityLink, eventLabel, eventPill } from "../../utils/activity"
import { errorText, formatDateTime, hashParams, todayUtc } from "../../utils/member"
import { saveFile } from "../../utils/payment"
import { describeBrowser } from "../../utils/session"

// The CSV holds at most this many rows (backend EXPORT_LIMIT).
const EXPORT_LIMIT = 10_000

const asDay = (value: string | null) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "")
const asEvent = (value: string | null): ActivityEvent | "" => EVENTS.find((e) => e.value === value)?.value ?? ""
function asId(value: string | null): number | null {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

/** The filters named in the address (#/activity?event=login_failed&q=192.0.2.66), so the Security page can link here. */
function filtersFromHash(): ActivityFilters {
  const params = hashParams()
  return {
    event: asEvent(params.get("event")),
    user_id: asId(params.get("user")),
    date_from: asDay(params.get("from")),
    date_to: asDay(params.get("to")),
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

// Admins only: every security event, newest first, with filters, the user filter and a CSV of the matching rows.
export default function ActivityPage() {
  // What is typed in the filter form, and the filters the list was last loaded with.
  const [draft, setDraft] = useState<ActivityFilters>(filtersFromHash)
  const [filters, setFilters] = useState<ActivityFilters>(filtersFromHash)
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState("")
  const [filterError, setFilterError] = useState("")
  const [exporting, setExporting] = useState(false)

  // Keep the filters in the address, so a reload or a shared link shows the same rows.
  useEffect(() => {
    window.history.replaceState(null, "", activityLink(filters))
  }, [filters])

  useEffect(() => {
    let ignore = false
    setLoading(true)
    setError("")
    listActivity(filters, 0)
      .then((page) => {
        if (ignore) return
        setEntries(page.items)
        setTotal(page.total)
      })
      .catch((err) => !ignore && setError(errorText(err)))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [filters])

  /** Load the list with new filters; the form shows the same ones. */
  function show(next: ActivityFilters) {
    setFilterError("")
    setDraft(next)
    setFilters(next)
  }

  function apply(e: FormEvent) {
    e.preventDefault()
    if (draft.date_from && draft.date_to && draft.date_from > draft.date_to) {
      setFilterError("The From date must be on or before the To date.")
      return
    }
    show({ ...draft, q: draft.q.trim() })
  }

  async function loadMore() {
    setLoadingMore(true)
    try {
      const page = await listActivity(filters, entries.length)
      setEntries((prev) => [...prev, ...page.items])
      setTotal(page.total)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoadingMore(false)
    }
  }

  async function exportCsv() {
    setExporting(true)
    setError("")
    try {
      saveFile(await exportActivityCsv(filters), `activity-${todayUtc()}.csv`)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setExporting(false)
    }
  }

  /** An email in the table: a button that shows only that account's activity, or plain text with no account. */
  function account(id: number | null, email: string | null, empty: string) {
    if (!email) return <span className="hint">{empty}</span>
    if (id === null) return <span className="wrap-text">{email}</span>
    return (
      <button
        type="button"
        className="linklike wrap-text"
        title="Show only this account's activity"
        onClick={() => show({ ...filters, user_id: id })}
      >
        {email}
      </button>
    )
  }

  let body
  if (loading && entries.length === 0) body = <p className="empty">Loading activity…</p>
  else if (entries.length === 0) body = <p className="empty">No activity matches these filters.</p>
  else
    body = (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Event</th>
              <th>Who</th>
              <th>Account affected</th>
              <th>Details</th>
              <th>Address</th>
              <th>Browser</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td>{formatDateTime(e.created_at)}</td>
                <td>
                  <span className={eventPill(e.event)}>{eventLabel(e.event)}</span>
                </td>
                {/* No actor: the server did it (a lockout, or a session ended for a reused refresh token). */}
                <td className="wrap">{account(e.actor_id, e.actor_email, "System")}</td>
                <td className="wrap">{account(e.target_id, e.target_email, "—")}</td>
                <td className="wrap">{e.details ?? "—"}</td>
                <td>
                  {e.ip ? (
                    <button
                      type="button"
                      className="linklike"
                      title="Show everything from this address"
                      onClick={() => show({ ...NO_ACTIVITY_FILTERS, q: e.ip ?? "" })}
                    >
                      {e.ip}
                    </button>
                  ) : (
                    <span className="hint">Unknown</span>
                  )}
                </td>
                <td title={e.user_agent ?? undefined}>{describeBrowser(e.user_agent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )

  return (
    <section className="card" aria-labelledby="activity-heading">
      <div className="toolbar">
        <h2 id="activity-heading">Security</h2>
        <div className="actions">
          <SecurityTabs current="activity" />
          <button onClick={exportCsv} disabled={exporting || loading || total === 0}>
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>
      </div>
      <p className="hint">
        Logins, failed logins, password and role changes, bans, ended sessions, deleted accounts and expenses, removed
        workouts and groups, and exports, with who did them, from which address and browser, and when. Passwords and tokens are never recorded.
      </p>
      <form className="filters" onSubmit={apply} noValidate aria-label="Filter activity">
        <div className="field">
          <label htmlFor="activity-event">Event</label>
          <select
            id="activity-event"
            value={draft.event}
            onChange={(e) => setDraft({ ...draft, event: e.target.value as ActivityEvent | "" })}
          >
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
          <input id="activity-from" type="date" value={draft.date_from} onChange={(e) => setDraft({ ...draft, date_from: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="activity-to">To</label>
          <input id="activity-to" type="date" value={draft.date_to} onChange={(e) => setDraft({ ...draft, date_to: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="activity-q">Search</label>
          <input
            id="activity-q"
            value={draft.q}
            onChange={(e) => setDraft({ ...draft, q: e.target.value })}
            maxLength={100}
            placeholder="Email, IP address or details"
            autoComplete="off"
          />
        </div>
        <div className="actions">
          <button className="primary" type="submit" disabled={loading}>
            Apply
          </button>
          <button type="button" onClick={() => show(NO_ACTIVITY_FILTERS)} disabled={loading}>
            Clear
          </button>
        </div>
      </form>
      {filterError && (
        <p className="error" role="alert">
          {filterError}
        </p>
      )}
      {filters.user_id && (
        <p className="hint">
          Only activity by or about <strong>{userLabel(filters.user_id, entries)}</strong>.{" "}
          <button type="button" className="linklike" onClick={() => show({ ...filters, user_id: null })}>
            Show everyone
          </button>
        </p>
      )}
      <p className="summary" aria-live="polite">
        <strong>{total}</strong> event{total === 1 ? "" : "s"}
        <span className="hint"> · times in your local time · the From and To dates are UTC days</span>
      </p>
      {total > EXPORT_LIMIT && (
        <p className="hint">The CSV holds the newest {EXPORT_LIMIT.toLocaleString("en-US")} rows; narrow the dates to export older ones.</p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {body}
      {entries.length > 0 && (
        <div className="list-foot">
          <span>
            Showing {entries.length} of {total}
          </span>
          {entries.length < total && (
            <button onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
