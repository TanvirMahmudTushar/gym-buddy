import { useCallback, useEffect, useRef, useState } from "react"
import Alert from "../../components/Alert"
import PageHeader from "../../components/PageHeader"
import Stat from "../../components/Stat"
import { getSecuritySummary } from "../../services/activityService"
import type { SecuritySummary } from "../../types/activity"
import { FAILED_LOGIN_ALERT, activityLink, eventLabel, eventPill } from "../../utils/activity"
import { errorText } from "../../utils/text"
import { formatDateTime, gymDay } from "../../utils/time"

/** How far back the page can look. The backend takes 1 to 168 hours. */
const PERIODS: { hours: number; label: string }[] = [
  { hours: 1, label: "1 hour" },
  { hours: 6, label: "6 hours" },
  { hours: 24, label: "24 hours" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "7 days" },
]

const DEFAULT_MIN = 3
const MAX_MIN = 10_000
const BROWSER_LENGTH = 40

/** As many failures as one lockout takes is worth a look, so the row is flagged. */
function Count({ value }: { value: number }) {
  return (
    <span>
      {value} {value >= FAILED_LOGIN_ALERT && <span className="pill bad">Watch</span>}
    </span>
  )
}

function ByAddress({ summary }: { summary: SecuritySummary }) {
  if (summary.by_ip.length === 0) return <p className="empty">No address has {summary.min_count} or more in this period.</p>
  const from = gymDay(summary.since)
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>IP address</th>
            <th>Failures</th>
            <th>What happened</th>
            <th>Emails tried</th>
            <th>Browser</th>
            <th>Last seen</th>
          </tr>
        </thead>
        <tbody>
          {summary.by_ip.map((row) => (
            <tr key={row.ip ?? "unknown"}>
              <td className="name">{row.ip ? <a href={activityLink({ q: row.ip, date_from: from })}>{row.ip}</a> : "Unknown address"}</td>
              <td data-label="Failures">
                <Count value={row.count} />
              </td>
              <td data-label="What happened">
                {row.events.map((e) => (
                  <span key={e.event} className={eventPill(e.event)}>
                    {eventLabel(e.event)} ×{e.count}
                  </span>
                ))}
              </td>
              <td data-label="Emails tried">
                {row.emails.length === 0 ? (
                  <span className="hint">None</span>
                ) : (
                  <>
                    {row.emails.map((email) => (
                      <span key={email} className="pill">
                        {email}
                      </span>
                    ))}
                    {row.accounts > row.emails.length && <span className="hint">and {row.accounts - row.emails.length} more</span>}
                  </>
                )}
              </td>
              <td data-label="Browser" title={row.user_agent ?? undefined}>
                {row.user_agent
                  ? row.user_agent.length > BROWSER_LENGTH
                    ? `${row.user_agent.slice(0, BROWSER_LENGTH)}…`
                    : row.user_agent
                  : "Unknown"}
              </td>
              <td data-label="Last seen">{formatDateTime(row.last_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ByAccount({ summary }: { summary: SecuritySummary }) {
  if (summary.by_account.length === 0) return <p className="empty">No email has {summary.min_count} or more failed logins in this period.</p>
  const from = gymDay(summary.since)
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Email tried</th>
            <th>Failed logins</th>
            <th>From addresses</th>
            <th>Last attempt</th>
          </tr>
        </thead>
        <tbody>
          {summary.by_account.map((row) => (
            <tr key={row.email}>
              <td className="name">
                {/* An account's link uses its id (exact); an email with no account can only be searched for. */}
                <a
                  href={activityLink(
                    row.user_id ? { event: "login_failed", user_id: row.user_id, date_from: from } : { event: "login_failed", q: row.email, date_from: from },
                  )}
                >
                  {row.email}
                </a>
                {row.user_id === null && <span className="hint">No account has this email</span>}
              </td>
              <td data-label="Failed logins">
                <Count value={row.count} />
              </td>
              <td data-label="Addresses">{row.ips}</td>
              <td data-label="Last attempt">{formatDateTime(row.last_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Admins only: spot password guessing and probing. Failed logins, rejected tokens and denied requests by address and by email.
export default function SecurityPage() {
  const [summary, setSummary] = useState<SecuritySummary | null>(null)
  const [hours, setHours] = useState(24)
  // The box holds text while it is being typed; the page asks for a number only once it is a whole number from 1 up.
  const [minText, setMinText] = useState(String(DEFAULT_MIN))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  // Only the newest request may show its answer, so a slow old one cannot replace it.
  const latest = useRef(0)

  const minCount = Number(minText)
  const minValid = Number.isInteger(minCount) && minCount >= 1 && minCount <= MAX_MIN

  const load = useCallback(async () => {
    if (!minValid) return
    const mine = ++latest.current
    setLoading(true)
    setError("")
    try {
      const result = await getSecuritySummary(hours, minCount)
      if (mine === latest.current) setSummary(result)
    } catch (err) {
      if (mine === latest.current) setError(errorText(err))
    } finally {
      if (mine === latest.current) setLoading(false)
    }
  }, [hours, minCount, minValid])

  // Typing a number asks again after a short pause, not on every key.
  useEffect(() => {
    const timer = setTimeout(() => void load(), 300)
    return () => clearTimeout(timer)
  }, [load])

  return (
    <div className="page">
      <PageHeader title="Security" subtitle={`Failed logins, rejected tokens and denied requests. ${FAILED_LOGIN_ALERT} wrong passwords in a row lock an account for 15 minutes.`}>
        <button type="button" onClick={load} disabled={loading || !minValid}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </PageHeader>
      <Alert>{error}</Alert>
      <section className="card">
        <div className="filters">
          <div className="field">
            <label htmlFor="security-min">Show addresses and emails with at least</label>
            <input
              id="security-min"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_MIN}
              value={minText}
              onChange={(e) => setMinText(e.target.value)}
              aria-invalid={!minValid}
            />
          </div>
          <div className="field">
            <label htmlFor="security-hours">failures in the last</label>
            <select id="security-hours" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              {PERIODS.map((p) => (
                <option key={p.hours} value={p.hours}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {!minValid && <p className="hint">Enter a whole number from 1 to {MAX_MIN}.</p>}
      </section>
      {!summary && loading && <p className="empty">Loading…</p>}
      {summary && (
        <>
          <section className="card">
            <div className="stats">
              <Stat label="Hostile requests" value={summary.total} href={activityLink({ date_from: gymDay(summary.since) })} />
              <Stat label="Failed logins" value={summary.failed_logins} href={activityLink({ event: "login_failed", date_from: gymDay(summary.since) })} />
              <Stat label="Lockouts" value={summary.lockouts} alert href={activityLink({ event: "account_locked", date_from: gymDay(summary.since) })} />
            </div>
          </section>
          <section className="card">
            <h2>By IP address</h2>
            <ByAddress summary={summary} />
          </section>
          <section className="card">
            <h2>By email</h2>
            <ByAccount summary={summary} />
          </section>
          <p className="hint">
            The 10 addresses and the 10 emails with the most. Many emails tried from one address, or one email tried from many addresses, points to
            someone guessing passwords. A token that was not made by this server, or a request the account may not make, is counted for its address.
          </p>
        </>
      )}
    </div>
  )
}
