import { useCallback, useEffect, useState } from "react"
import { useAuth } from "../context/AuthContext"
import { usePlans } from "../context/PlansContext"
import { getUserDetail } from "../services/adminService"
import { ApiError } from "../services/api"
import type { AdminUserDetail } from "../types/auth"
import { activityLink, eventLabel, eventPill } from "../utils/activity"
import { can, usersLink } from "../utils/auth"
import { memberStatus, membersLink } from "../utils/member"
import { describeBrowser } from "../utils/session"
import { count, errorText } from "../utils/text"
import { formatDate, formatDateTime } from "../utils/time"
import { trainingLink } from "../utils/workout"
import Alert from "./Alert"
import BookingRow from "./BookingRow"
import PageHeader from "./PageHeader"
import PaymentRow from "./PaymentRow"
import RolePill from "./RolePill"
import Stat from "./Stat"
import StatusPill from "./StatusPill"
import UserActionModal, { type UserAction } from "./UserActionModal"
import VisitRow from "./VisitRow"

const BACK = { href: usersLink(), label: "All users" }

function Account({ detail: d }: { detail: AdminUserDetail }) {
  const { planLabel } = usePlans()
  const locked = d.locked_until !== null && new Date(d.locked_until) > new Date()
  return (
    <section className="card">
      <h2>Account</h2>
      <dl className="facts">
        <dt>Email</dt>
        <dd>{d.email}</dd>
        <dt>Role</dt>
        <dd>
          <RolePill role={d.role} />
        </dd>
        <dt>Status</dt>
        <dd>
          <span className={d.is_banned ? "pill bad" : "pill good"}>{d.is_banned ? "Banned" : "Active"}</span>{" "}
          {d.is_banned && d.banned_at && <span className="hint">since {formatDate(d.banned_at)}</span>}
        </dd>
        {d.is_banned && (
          <>
            <dt>Ban reason</dt>
            <dd>{d.ban_reason ?? "Not given"}</dd>
          </>
        )}
        {locked && (
          <>
            <dt>Login</dt>
            <dd>Locked until {formatDateTime(d.locked_until ?? "")} after wrong passwords</dd>
          </>
        )}
        <dt>Password</dt>
        <dd>
          {d.must_change_password ? "Temporary, must be changed" : d.password_changed_at ? `Changed ${formatDateTime(d.password_changed_at)}` : "Never changed"}
        </dd>
        <dt>Signed up</dt>
        <dd>{formatDateTime(d.created_at)}</dd>
        <dt>Membership</dt>
        <dd>
          {d.plan && d.expires_on ? (
            <>
              <a href={membersLink({ member: d.id })}>{planLabel(d.plan)}</a>{" "}
              <StatusPill status={memberStatus({ is_frozen: d.is_frozen, expires_on: d.expires_on })} />{" "}
              <span className="hint">until {formatDate(d.expires_on)}</span>
            </>
          ) : (
            "None"
          )}
        </dd>
      </dl>
    </section>
  )
}

function Records({ detail: d }: { detail: AdminUserDetail }) {
  const { records: n, recent_records: recent } = d
  const nothing = n.workouts_added + n.workouts_assigned + n.bookings + n.visits + n.payments === 0
  return (
    <section className="card">
      <div className="toolbar">
        <h2>Records</h2>
        <a href={trainingLink("all-workouts", { owner: d.id })}>Workouts they added</a>
      </div>
      <div className="stats">
        <Stat label="Workouts added" value={n.workouts_added} />
        <Stat label="Workouts assigned" value={n.workouts_assigned} note={`${n.workouts_completed} done`} />
        <Stat label="Bookings" value={n.bookings} />
        <Stat label="Visits" value={n.visits} />
        <Stat label="Payments" value={n.payments} />
      </div>
      {nothing && <p className="empty">Nothing on record yet.</p>}
      <div className="split">
        {recent.workouts.length > 0 && (
          <div className="stack">
            <h3>Newest workouts</h3>
            <ul className="rows">
              {recent.workouts.map((w) => (
                <li key={w.id}>
                  <span>
                    <span className="row-title">{w.title}</span>
                    <span className="hint">
                      {formatDate(w.workout_date)} · {w.group_name ?? "no group"} · {w.owner_id === d.id ? "added" : "assigned"}
                    </span>
                  </span>
                  {w.completed_at ? <span className="pill good">Done</span> : <span />}
                </li>
              ))}
            </ul>
          </div>
        )}
        {recent.bookings.length > 0 && (
          <div className="stack">
            <h3>Newest bookings</h3>
            <ul className="rows">
              {recent.bookings.map((b) => (
                <BookingRow key={b.class_id} booking={b} />
              ))}
            </ul>
          </div>
        )}
        {recent.visits.length > 0 && (
          <div className="stack">
            <h3>Newest visits</h3>
            <ul className="rows">
              {recent.visits.map((v) => (
                <VisitRow key={v.id} visit={v} showRecorder />
              ))}
            </ul>
          </div>
        )}
        {recent.payments.length > 0 && (
          <div className="stack">
            <h3>Newest payments</h3>
            <ul className="rows">
              {recent.payments.map((p) => (
                <PaymentRow key={p.id} payment={p} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

// Admins only: one account in full. Its membership, the browsers it is logged in on, its records and training groups,
// and its newest activity.
export default function UserDetail({ userId }: { userId: number }) {
  const { user: me } = useAuth()
  const [detail, setDetail] = useState<AdminUserDetail | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [action, setAction] = useState<UserAction | null>(null)

  const load = useCallback(async () => {
    try {
      setDetail(await getUserDetail(userId))
      setError("")
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? "No account has this id. It may have been deleted." : errorText(err))
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  if (!detail)
    return (
      <div className="page">
        <PageHeader title="User" back={BACK} />
        {error ? <Alert>{error}</Alert> : <p className="empty">Loading…</p>}
      </div>
    )

  const d = detail
  const isMe = d.id === me?.id
  // The API has the same rules: not yourself, and not another admin.
  const canAct = !isMe && d.role !== "admin"

  return (
    <div className="page">
      <PageHeader back={BACK} title={isMe ? `${d.name} (you)` : d.name} subtitle={d.email}>
        {canAct && can(me, "users:reset_password") && (
          <button type="button" onClick={() => setAction({ kind: "reset", user: d })}>
            Reset password
          </button>
        )}
        {!isMe && can(me, "users:revoke_sessions") && d.sessions.length > 0 && (
          <button type="button" onClick={() => setAction({ kind: "revoke", user: d })}>
            Log out everywhere
          </button>
        )}
        {canAct && can(me, "users:ban") && (
          <button type="button" className={d.is_banned ? undefined : "danger"} onClick={() => setAction({ kind: d.is_banned ? "unban" : "ban", user: d })}>
            {d.is_banned ? "Unban" : "Ban"}
          </button>
        )}
      </PageHeader>
      <Alert kind="success">{notice}</Alert>
      <Alert>{error}</Alert>
      <div className="split">
        <Account detail={d} />
        <div className="column">
          <section className="card">
            <h2>Sessions {d.sessions.length > 0 && <span className="hint">({d.sessions.length})</span>}</h2>
            {d.sessions.length === 0 ? (
              <p className="empty">Not logged in anywhere.</p>
            ) : (
              <ul className="rows">
                {d.sessions.map((s) => (
                  <li key={s.id}>
                    <span>
                      <span className="row-title">{describeBrowser(s.user_agent)}</span>
                      <span className="hint">
                        {s.ip ?? "Unknown address"} · last used {formatDateTime(s.last_used_at)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card">
            <h2>Training groups {d.groups.length > 0 && <span className="hint">({d.groups.length})</span>}</h2>
            {d.groups.length === 0 ? (
              <p className="empty">Not in any group.</p>
            ) : (
              <ul className="rows">
                {d.groups.map((g) => (
                  <li key={g.id}>
                    <span>
                      <span className="row-title">{g.name}</span>
                      <span className="hint">{count(g.member_count, "person", "people")}</span>
                    </span>
                    <span className={g.is_owner ? "pill info" : "pill"}>{g.is_owner ? "Owner" : "Member"}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
      <Records detail={d} />
      <section className="card">
        <div className="toolbar">
          <h2>Recent activity</h2>
          <a href={activityLink({ user_id: d.id })}>All their activity</a>
        </div>
        {d.recent_activity.length === 0 ? (
          <p className="empty">Nothing recorded yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Time</th>
                  <th>By</th>
                  <th>Details</th>
                  <th>Address</th>
                </tr>
              </thead>
              <tbody>
                {d.recent_activity.map((e) => (
                  <tr key={e.id}>
                    <td className="name">
                      <span className={eventPill(e.event)}>{eventLabel(e.event)}</span>
                    </td>
                    <td data-label="Time" className="nowrap">
                      {formatDateTime(e.created_at)}
                    </td>
                    <td data-label="By">{e.actor_id === d.id ? "Themself" : (e.actor_email ?? "System")}</td>
                    <td data-label="Details">{e.details ?? "—"}</td>
                    <td data-label="Address">{e.ip ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {action && (
        <UserActionModal
          action={action}
          onClose={() => setAction(null)}
          onChanged={load}
          onDone={(message) => {
            setNotice(message)
            setAction(null)
            void load()
          }}
        />
      )}
    </div>
  )
}
