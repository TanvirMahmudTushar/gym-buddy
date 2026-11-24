import { useCallback, useEffect, useState } from "react"
import SecurityTabs from "../../components/SecurityTabs"
import Stat from "../../components/Stat"
import { getSecuritySummary } from "../../services/activityService"
import type { FailedLoginWindow, SecuritySummary } from "../../types/activity"
import { FAILED_LOGIN_ALERT, activityLink } from "../../utils/activity"
import { errorText, formatDateTime } from "../../utils/member"

type WindowKey = "last_24_hours" | "last_7_days"

const WINDOWS: { key: WindowKey; label: string }[] = [
  { key: "last_24_hours", label: "Last 24 hours" },
  { key: "last_7_days", label: "Last 7 days" },
]

/** The Activity page's From date for a window: the UTC day it starts on, so the list includes all of it. */
const fromDay = (w: FailedLoginWindow) => w.since.slice(0, 10)

/** As many failures as one lockout takes is worth a look, so the row is flagged. */
function Count({ value }: { value: number }) {
  return (
    <>
      {value}
      {value >= FAILED_LOGIN_ALERT && (
        <>
          {" "}
          <span className="pill banned">Watch</span>
        </>
      )}
    </>
  )
}

function ByAddress({ window: w }: { window: FailedLoginWindow }) {
  if (w.by_ip.length === 0) return <p className="empty">No failed logins.</p>
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Address</th>
            <th>Failed logins</th>
            <th>Accounts tried</th>
            <th>Last attempt</th>
          </tr>
        </thead>
        <tbody>
          {w.by_ip.map((row) => (
            <tr key={row.ip ?? "unknown"}>
              <td className="name">
                {row.ip ? (
                  <a href={activityLink({ event: "login_failed", q: row.ip, date_from: fromDay(w) })}>{row.ip}</a>
                ) : (
                  <span className="hint">Unknown address</span>
                )}
              </td>
              <td>
                <Count value={row.count} />
              </td>
              <td>{row.accounts}</td>
              <td>{formatDateTime(row.last_at)}</td>
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
              <td className="name wrap">
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
                {row.user_id === null && <div className="hint">No account has this email</div>}
              </td>
              <td>
                <Count value={row.count} />
              </td>
              <td>{row.ips}</td>
              <td>{formatDateTime(row.last_at)}</td>
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

  const day = summary?.last_24_hours
  const week = summary?.last_7_days
  const shown = summary?.[windowKey]

  return (
    <div className="column">
      <div className="toolbar">
        <h2>Security</h2>
        <div className="actions">
          <SecurityTabs current="security" />
          <button onClick={load} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!summary && loading && <p className="empty">Loading failed logins…</p>}
      {day && week && shown && (
        <>
          <section className="card" aria-labelledby="security-totals">
            <h2 id="security-totals">Failed logins</h2>
            <dl className="stats">
              <Stat label="Last 24 hours" value={day.total} href={activityLink({ event: "login_failed", date_from: fromDay(day) })} />
              <Stat label="Last 7 days" value={week.total} href={activityLink({ event: "login_failed", date_from: fromDay(week) })} />
              <Stat
                label="Lockouts, 24 hours"
                value={day.lockouts}
                alert
                href={activityLink({ event: "account_locked", date_from: fromDay(day) })}
              />
              <Stat label="Lockouts, 7 days" value={week.lockouts} href={activityLink({ event: "account_locked", date_from: fromDay(week) })} />
            </dl>
            <p className="hint">
              A failed login is a wrong password, an email with no account, or a login to a locked or banned account.
              {` ${FAILED_LOGIN_ALERT}`} wrong passwords in a row lock an account for 15 minutes. Many accounts tried
              from one address, or one account tried from many addresses, points to someone guessing passwords.
            </p>
          </section>
          <section className="card" aria-labelledby="security-groups">
            <div className="toolbar">
              <h2 id="security-groups">Where they came from</h2>
              <div className="chips" role="group" aria-label="Which period to show">
                {WINDOWS.map((w) => (
                  <button key={w.key} type="button" className="chip" aria-pressed={windowKey === w.key} onClick={() => setWindowKey(w.key)}>
                    {w.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="hint">
              The 10 addresses and the 10 emails with the most failed logins since {formatDateTime(shown.since)}. Rows
              with {FAILED_LOGIN_ALERT} or more are marked <span className="pill banned">Watch</span>. Open one to see
              each attempt with its browser.
            </p>
            <h3>By address</h3>
            <ByAddress window={shown} />
            <h3>By account</h3>
            <ByAccount window={shown} />
          </section>
        </>
      )}
    </div>
  )
}
