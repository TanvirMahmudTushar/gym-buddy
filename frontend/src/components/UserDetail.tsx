import { type FormEvent, useCallback, useEffect, useState } from "react"
import { useAuth } from "../context/AuthContext"
import { usePlans } from "../context/PlansContext"
import { banUser, getUserDetail, revokeSessions, unbanUser } from "../services/adminService"
import { ApiError } from "../services/api"
import type { AdminUserDetail } from "../types/auth"
import { activityLink, eventLabel, eventPill } from "../utils/activity"
import { can, roleLabel, usersLink } from "../utils/auth"
import { errorText, formatDate, formatDateTime, membersLink, todayUtc } from "../utils/member"
import { describeBrowser } from "../utils/session"
import { trainingLink } from "../utils/workout"
import Stat from "./Stat"
import StatusPill from "./StatusPill"

interface Props {
  userId: number
}

// Admins only: one account in full. Its membership, the browsers it is logged in on (with Log out everywhere), how much
// it has on record, its training groups, and its newest activity.
export default function UserDetail({ userId }: Props) {
  const { user: me } = useAuth()
  const { planLabel } = usePlans()
  const [detail, setDetail] = useState<AdminUserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [confirming, setConfirming] = useState<"revoke" | "ban" | null>(null)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setDetail(await getUserDetail(userId))
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true)
      else setError(errorText(err))
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  /** Run an action, show what happened, and load the account again so every section is current. */
  async function act(action: () => Promise<string>) {
    setBusy(true)
    setError("")
    setNotice("")
    try {
      setNotice(await action())
      setConfirming(null)
      setReason("")
      await load()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  if (loading && !detail) return <p className="empty">Loading the account…</p>
  if (notFound)
    return (
      <section className="card">
        <h2>User not found</h2>
        <p className="empty">No account has this id. It may have been deleted.</p>
        <a href={usersLink(null)}>Back to users</a>
      </section>
    )
  if (!detail)
    return (
      <p className="error" role="alert">
        {error}
      </p>
    )

  const d = detail
  const isMe = d.id === me?.id
  const canRevoke = can(me, "users:revoke_sessions") && !isMe && d.sessions.length > 0
  const canBan = can(me, "users:ban") && !isMe && d.role !== "admin"
  const locked = d.locked_until !== null && new Date(d.locked_until) > new Date()

  function submitBan(e: FormEvent) {
    e.preventDefault()
    void act(async () => {
      await banUser(d.id, reason.trim())
      return `${d.name} is banned and logged out of every browser.`
    })
  }

  return (
    <div className="column">
      <section className="card" aria-labelledby="user-heading">
        <div className="toolbar">
          <h2 id="user-heading" className="wrap-text">
            {d.name}
            {isMe && <span className="hint"> (you)</span>}
          </h2>
          <a href={usersLink(null)}>All users</a>
        </div>
        <dl className="facts">
          <dt>Email</dt>
          <dd>{d.email}</dd>
          <dt>Role</dt>
          <dd>
            <span className={`pill role-${d.role}`}>{roleLabel(d.role)}</span>
          </dd>
          <dt>Status</dt>
          <dd>
            <span className={d.is_banned ? "pill banned" : "pill active"}>{d.is_banned ? "Banned" : "Active"}</span>
            {d.is_banned && (
              <span className="hint">
                {" "}
                {d.banned_at && `since ${formatDate(d.banned_at)}`}
                {d.ban_reason && ` · ${d.ban_reason}`}
              </span>
            )}
            {locked && <span className="hint"> · logins blocked until {formatDateTime(d.locked_until ?? "")} after wrong passwords</span>}
            {d.must_change_password && <span className="hint"> · must choose a new password (reset by an admin)</span>}
          </dd>
          <dt>Signed up</dt>
          <dd>{formatDateTime(d.created_at)}</dd>
          <dt>Membership</dt>
          <dd>
            {d.plan && d.expires_on ? (
              <>
                <a href={membersLink({ member: d.id })}>{planLabel(d.plan)}</a>{" "}
                <StatusPill status={d.is_frozen ? "frozen" : d.expires_on < todayUtc() ? "expired" : "active"} />
                <span className="hint">
                  {" "}
                  {d.joined_on && `joined ${formatDate(d.joined_on)} · `}until {formatDate(d.expires_on)}
                </span>
              </>
            ) : (
              <span className="hint">None</span>
            )}
          </dd>
        </dl>
        {(canBan || (can(me, "users:ban") && d.is_banned)) && (
          <div className="actions">
            {d.is_banned ? (
              <button
                type="button"
                onClick={() =>
                  act(async () => {
                    await unbanUser(d.id)
                    return `${d.name} can log in again.`
                  })
                }
                disabled={busy}
              >
                Unban
              </button>
            ) : (
              <button type="button" className="danger" onClick={() => setConfirming("ban")} disabled={busy}>
                Ban
              </button>
            )}
          </div>
        )}
        {confirming === "ban" && (
          <form className="confirm" onSubmit={submitBan}>
            <div className="field">
              <label htmlFor="detail-ban-reason">Reason for banning {d.name} (optional)</label>
              <input id="detail-ban-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} autoFocus />
            </div>
            <div className="actions">
              <button type="submit" className="danger solid" disabled={busy}>
                {busy ? "Banning…" : "Ban user"}
              </button>
              <button type="button" onClick={() => setConfirming(null)} disabled={busy}>
                Cancel
              </button>
            </div>
          </form>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="hint" role="status">
            {notice}
          </p>
        )}
      </section>

      <section className="card" aria-labelledby="user-sessions-heading">
        <div className="toolbar">
          <h2 id="user-sessions-heading">Where they are logged in</h2>
          {canRevoke && (
            <button type="button" className="danger" onClick={() => setConfirming("revoke")} disabled={busy}>
              Log out everywhere
            </button>
          )}
        </div>
        {confirming === "revoke" && (
          <div className="confirm" role="alertdialog" aria-labelledby="confirm-revoke">
            <span id="confirm-revoke">
              Log {d.name} out of all {d.sessions.length} browser{d.sessions.length === 1 ? "" : "s"}? Their next request
              is refused and they must log in again. Their password does not change.
            </span>
            <div className="actions">
              <button
                type="button"
                className="danger solid"
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    const { revoked } = await revokeSessions(d.id)
                    return `${d.name} is logged out of ${revoked} browser${revoked === 1 ? "" : "s"}.`
                  })
                }
              >
                {busy ? "Logging out…" : "Yes, log them out"}
              </button>
              <button type="button" onClick={() => setConfirming(null)} disabled={busy}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {d.sessions.length === 0 ? (
          <p className="empty">Not logged in anywhere.</p>
        ) : (
          <ul className="visit-list session-list">
            {d.sessions.map((s) => (
              <li key={s.id}>
                <span>
                  <strong>{describeBrowser(s.user_agent)}</strong>
                  <br />
                  <span className="hint">
                    {s.ip ?? "Unknown address"} · logged in {formatDateTime(s.created_at)} · last active {formatDateTime(s.last_used_at)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="user-records-heading">
        <h2 id="user-records-heading">Records and training groups</h2>
        <dl className="stats">
          <Stat label="Visits" value={d.records.visits} />
          <Stat label="Class bookings" value={d.records.bookings} />
          <Stat label="Payments" value={d.records.payments} />
          <Stat label="Workouts added" value={d.records.workouts_added} />
          <Stat label="Workouts assigned" value={d.records.workouts_assigned} note={`${d.records.workouts_completed} done`} />
        </dl>
        <p className="hint">
          {d.plan && <a href={membersLink({ member: d.id })}>Open their visits, bookings and payments</a>}
          {d.plan && can(me, "content:moderate") && " · "}
          {can(me, "content:moderate") && (
            <a href={trainingLink("all-workouts", d.id)}>See the workouts and groups they added</a>
          )}
        </p>
        {d.groups.length === 0 ? (
          <p className="empty">Not in any group.</p>
        ) : (
          <ul className="visit-list">
            {d.groups.map((g) => (
              <li key={g.id}>
                <span>
                  <strong>{g.name}</strong>{" "}
                  <span className="hint">
                    · {g.is_owner ? "Owner" : "Member"} · {g.member_count} {g.member_count === 1 ? "person" : "people"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="user-activity-heading">
        <div className="toolbar">
          <h2 id="user-activity-heading">Recent activity</h2>
          <a href={activityLink({ user_id: d.id })}>All their activity</a>
        </div>
        {d.recent_activity.length === 0 ? (
          <p className="empty">Nothing recorded yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Event</th>
                  <th>Details</th>
                  <th>Address</th>
                </tr>
              </thead>
              <tbody>
                {d.recent_activity.map((e) => (
                  <tr key={e.id}>
                    <td>{formatDateTime(e.created_at)}</td>
                    <td>
                      <span className={eventPill(e.event)}>{eventLabel(e.event)}</span>
                      {e.actor_id !== d.id && e.actor_email && <div className="hint">by {e.actor_email}</div>}
                    </td>
                    <td className="wrap">{e.details ?? "—"}</td>
                    <td>{e.ip ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
