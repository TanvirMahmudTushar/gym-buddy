import { useCallback, useEffect, useState } from "react"
import Alert from "../../components/Alert"
import PageHeader from "../../components/PageHeader"
import Stat from "../../components/Stat"
import { getSecuritySummary } from "../../services/activityService"
import type { FailedLoginWindow, SecuritySummary } from "../../types/activity"
import { FAILED_LOGIN_ALERT, activityLink } from "../../utils/activity"
import { errorText } from "../../utils/text"
import { formatDateTime, gymDay } from "../../utils/time"

type WindowKey = "last_24_hours" | "last_7_days"

const WINDOWS: { key: WindowKey; label: string }[] = [
  { key: "last_24_hours", label: "Last 24 hours" },
  { key: "last_7_days", label: "Last 7 days" },
]

/** The Activity page's From date for a window: the day it starts on, so the list includes all of it. */
const fromDay = (w: FailedLoginWindow) => gymDay(w.since)

/** As many failures as one lockout takes is worth a look, so the row is flagged. */
function Count({ value }: { value: number }) {
  return (
    <span>
      {value} {value >= FAILED_LOGIN_ALERT && <span className="pill bad">Watch</span>}
    </span>
  )
}

function ByAddress({ window: w }: { window: FailedLoginWindow }) {
  if (w.by_ip.length === 0) return <p className="empty">No failed logins.</p>
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>IP address</th>
            <th>Failed logins</th>
            <th>Accounts tried</th>
            <th>Last attempt</th>
          </tr>
        </thead>
        <tbody>
          {w.by_ip.map((row) => (
            <tr key={row.ip ?? "unknown"}>
              <td className="name">
                {row.ip ? <a href={activityLink({ event: "login_failed", q: row.ip, date_from: fromDay(w) })}>{row.ip}</a> : "Unknown address"}
              </td>
              <td data-label="Failed logins">
                <Count value={row.count} />
              </td>
              <td data-label="Accounts tried">{row.accounts}</td>
              <td data-label="Last attempt">{formatDateTime(row.last_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ByAccount({ window: w }: { window: FailedLoginWindow }) {
  if (w.by_account.length === 0) return <p className="empty">No failed logins.</p>
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
          {w.by_account.map((row) => (
            <tr key={row.email}>
              <td className="name">
                {/* An account's link uses its id (exact); an email with no account can only be searched for. */}
                <a
                  href={activityLink(
                    row.user_id
                      ? { event: "login_failed", user_id: row.user_id, date_from: fromDay(w) }
                      : { event: "login_failed", q: row.email, date_from: fromDay(w) },
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

// Admins only: spot password guessing. Failed logins in the last 24 hours and 7 days, by address and by account.
export default function SecurityPage() {
  const [summary, setSummary] = useState<SecuritySummary | null>(null)
  const [windowKey, setWindowKey] = useState<WindowKey>("last_24_hours")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      setSummary(await getSecuritySummary())
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const shown = summary?.[windowKey]

  return (
    <div className="page">
      <PageHeader title="Security" subtitle={`Failed logins. ${FAILED_LOGIN_ALERT} wrong passwords in a row lock an account for 15 minutes.`}>
        <button type="button" onClick={load} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </PageHeader>
      <Alert>{error}</Alert>
      {!summary && loading && <p className="empty">Loading…</p>}
      {summary && shown && (
        <>
          <section className="card">
            <div className="stats">
              {WINDOWS.map((w) => (
                <Stat
                  key={w.key}
                  label={`Failed logins, ${w.label.toLowerCase()}`}
                  value={summary[w.key].total}
                  href={activityLink({ event: "login_failed", date_from: fromDay(summary[w.key]) })}
                />
              ))}
              {WINDOWS.map((w) => (
                <Stat
                  key={w.key}
                  label={`Lockouts, ${w.label.toLowerCase()}`}
                  value={summary[w.key].lockouts}
                  alert
                  href={activityLink({ event: "account_locked", date_from: fromDay(summary[w.key]) })}
                />
              ))}
            </div>
          </section>
          <div className="chips" role="group" aria-label="Which period to show">
            {WINDOWS.map((w) => (
              <button key={w.key} type="button" className="chip" aria-pressed={windowKey === w.key} onClick={() => setWindowKey(w.key)}>
                {w.label}
              </button>
            ))}
          </div>
          <section className="card">
            <h2>By IP address</h2>
            <ByAddress window={shown} />
          </section>
          <section className="card">
            <h2>By account</h2>
            <ByAccount window={shown} />
          </section>
          <p className="hint">
            The 10 addresses and the 10 emails with the most failed logins. Many accounts tried from one address, or one account tried from many
            addresses, points to someone guessing passwords.
          </p>
        </>
      )}
    </div>
  )
}
