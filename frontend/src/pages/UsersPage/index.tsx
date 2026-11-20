import { type FormEvent, Fragment, useEffect, useState } from "react"
import StatusPill from "../../components/StatusPill"
import { useAuth } from "../../context/AuthContext"
import { useDebouncedValue } from "../../hooks/useDebouncedValue"
import { banUser, changeRole, listUsers, unbanUser } from "../../services/adminService"
import type { AdminUser, Role } from "../../types/auth"
import { ROLES } from "../../utils/auth"
import { errorText, formatDate, membersLink, planLabel, todayUtc } from "../../utils/member"

// Members and users are the same accounts: this shows the membership and links to it on the Members page.
function MembershipCell({ user: u }: { user: AdminUser }) {
  if (u.plan && u.expires_on) {
    const status = u.is_frozen ? "frozen" : u.expires_on < todayUtc() ? "expired" : "active"
    return (
      <>
        <a href={membersLink({ member: u.id })}>{planLabel(u.plan)}</a> <StatusPill status={status} />
        <div className="hint">until {formatDate(u.expires_on)}</div>
      </>
    )
  }
  // A User with no membership is on the Members page's waiting list.
  if (u.role === "user")
    return (
      <>
        <span className="hint">None yet</span>
        <div>
          <a href="#/members">Start on Members</a>
        </div>
      </>
    )
  return <span className="hint">—</span>
}

// Admins only: see everyone who has signed up, change their role, and ban or unban them.
export default function UsersPage() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [search, setSearch] = useState("")
  const query = useDebouncedValue(search)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState("")
  // The user a request is running for, so their controls are disabled meanwhile.
  const [savingId, setSavingId] = useState<number | null>(null)
  const [notice, setNotice] = useState("")
  // The user the admin is about to ban, and the reason typed so far.
  const [banningId, setBanningId] = useState<number | null>(null)
  const [reason, setReason] = useState("")

  useEffect(() => {
    let ignore = false
    setLoading(true)
    listUsers(0, query)
      .then((page) => {
        if (ignore) return
        setUsers(page.items)
        setTotal(page.total)
      })
      .catch((err) => !ignore && setError(errorText(err)))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [query])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const page = await listUsers(users.length, query)
      setUsers((prev) => [...prev, ...page.items])
      setTotal(page.total)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoadingMore(false)
    }
  }

  /** Run one change for a user, replace their row with the result, and show a message. */
  async function change(target: AdminUser, run: () => Promise<AdminUser>, message: (updated: AdminUser) => string) {
    setSavingId(target.id)
    setError("")
    setNotice("")
    try {
      const updated = await run()
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
      setNotice(message(updated))
      return true
    } catch (err) {
      setError(errorText(err))
      return false
    } finally {
      setSavingId(null)
    }
  }

  const handleRoleChange = (target: AdminUser, role: Role) =>
    change(target, () => changeRole(target.id, role), (u) => `${u.name} is now ${ROLES.find((r) => r.value === role)?.label}. They get the new access when they log in again.`)

  async function handleBan(e: FormEvent, target: AdminUser) {
    e.preventDefault()
    const ok = await change(target, () => banUser(target.id, reason.trim()), (u) => `${u.name} is banned and is logged out on their next request.`)
    if (ok) {
      setBanningId(null)
      setReason("")
    }
  }

  const handleUnban = (target: AdminUser) => change(target, () => unbanUser(target.id), (u) => `${u.name} can log in again.`)

  function startBan(id: number) {
    setBanningId(id)
    setReason("")
    setError("")
    setNotice("")
  }

  let body
  if (loading && users.length === 0) body = <p className="empty">Loading users…</p>
  else if (users.length === 0) body = <p className="empty">{query ? `No users match "${query}".` : "No users yet."}</p>
  else
    body = (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Membership</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isMe = u.id === me?.id
              const busy = savingId === u.id
              return (
                <Fragment key={u.id}>
                  <tr>
                    <td className="name">
                      {u.name}
                      {isMe && <span className="hint"> (you)</span>}
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <select
                        className="role-select"
                        aria-label={`Role for ${u.name}`}
                        value={u.role}
                        // Your own role is locked so the system always keeps an admin.
                        disabled={isMe || busy}
                        onChange={(e) => handleRoleChange(u, e.target.value as Role)}
                      >
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="wrap">
                      <MembershipCell user={u} />
                    </td>
                    <td className="wrap">
                      <span className={u.is_banned ? "pill banned" : "pill active"}>{u.is_banned ? "Banned" : "Active"}</span>
                      {u.is_banned && (
                        <div className="hint">
                          {u.banned_at && `Since ${formatDate(u.banned_at)}`}
                          {u.ban_reason && ` · ${u.ban_reason}`}
                        </div>
                      )}
                    </td>
                    <td>{formatDate(u.created_at)}</td>
                    <td>
                      {u.is_banned ? (
                        <button onClick={() => handleUnban(u)} disabled={busy}>
                          {busy ? "Unbanning…" : "Unban"}
                        </button>
                      ) : u.role === "admin" ? (
                        // Admins cannot be banned: demote them first.
                        <span className="hint">{isMe ? "—" : "Demote to ban"}</span>
                      ) : (
                        <button className="danger" onClick={() => startBan(u.id)} disabled={busy || banningId === u.id}>
                          Ban
                        </button>
                      )}
                    </td>
                  </tr>
                  {banningId === u.id && (
                    <tr className="ban-row">
                      <td colSpan={7}>
                        <form className="ban-form" onSubmit={(e) => handleBan(e, u)}>
                          <div className="field">
                            <label htmlFor={`ban-reason-${u.id}`}>Reason for banning {u.name} (optional)</label>
                            <input
                              id={`ban-reason-${u.id}`}
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              maxLength={500}
                              autoFocus
                            />
                          </div>
                          <button className="danger solid" type="submit" disabled={busy}>
                            {busy ? "Banning…" : "Ban user"}
                          </button>
                          <button type="button" onClick={() => setBanningId(null)} disabled={busy}>
                            Cancel
                          </button>
                        </form>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    )

  return (
    <section className="card" aria-labelledby="users-heading">
      <div className="toolbar">
        <h2 id="users-heading">Users and roles</h2>
        <input
          type="search"
          className="search"
          aria-label="Search users by name or email"
          placeholder="Search name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          maxLength={100}
        />
      </div>
      <p className="hint">
        Everyone starts as a User. Make someone a Gym Manager to let them manage members. A banned user is locked out
        at once, and you can unban them later.
      </p>
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
      {body}
      {!loading && (
        <div className="list-foot">
          <span>
            Showing {users.length} of {total}
          </span>
          {users.length < total && (
            <button onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
