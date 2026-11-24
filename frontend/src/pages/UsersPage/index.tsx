import { type FormEvent, Fragment, useEffect, useState } from "react"
import StatusPill from "../../components/StatusPill"
import UserBulkBar from "../../components/UserBulkBar"
import UserDetail from "../../components/UserDetail"
import { useAuth } from "../../context/AuthContext"
import { usePlans } from "../../context/PlansContext"
import { useDebouncedValue } from "../../hooks/useDebouncedValue"
import { banUser, changeRole, exportUsersCsv, listUsers, resetPassword, unbanUser } from "../../services/adminService"
import type { AdminUser, Role, UserFilters } from "../../types/auth"
import { ROLES, can, usersLink } from "../../utils/auth"
import { errorText, formatDate, hashParams, membersLink, todayUtc } from "../../utils/member"
import { saveFile } from "../../utils/payment"

// Members and users are the same accounts: this shows the membership and links to it on the Members page.
function MembershipCell({ user: u }: { user: AdminUser }) {
  const { planLabel } = usePlans()
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

/** The user named in the address (#/users?user=5), or null for the list. */
function userFromHash(): number | null {
  const id = Number(hashParams().get("user"))
  return Number.isInteger(id) && id > 0 ? id : null
}

// Admins only: see everyone who has signed up, filter them, change their role, ban or unban one or many, and export.
function UserList() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [search, setSearch] = useState("")
  const query = useDebouncedValue(search)
  const [role, setRole] = useState<UserFilters["role"]>("")
  const [status, setStatus] = useState<UserFilters["status"]>("")
  // Ticked rows for the bulk ban and unban; cleared whenever the filters change.
  const [checkedIds, setCheckedIds] = useState<number[]>([])
  const [reloadKey, setReloadKey] = useState(0)
  const [exporting, setExporting] = useState(false)
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
  // The user an admin is about to reset the password for, and the temporary password just made (shown once).
  const [resettingId, setResettingId] = useState<number | null>(null)
  const [resetResult, setResetResult] = useState<{ id: number; name: string; password: string } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let ignore = false
    setLoading(true)
    setCheckedIds([])
    listUsers({ q: query, role, status }, 0)
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
  }, [query, role, status, reloadKey])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const page = await listUsers({ q: query, role, status }, users.length)
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

  function handleRoleChange(target: AdminUser, role: Role) {
    // The API keeps an ex-trainer's name on their classes as plain text, so the timetable still shows it.
    const classes = target.role === "trainer" && role !== "trainer" ? " Their classes keep their name but no longer show on their My classes." : ""
    return change(
      target,
      () => changeRole(target.id, role),
      (u) => `${u.name} is now ${ROLES.find((r) => r.value === role)?.label}. They get the new access when they log in again.${classes}`,
    )
  }

  async function handleBan(e: FormEvent, target: AdminUser) {
    e.preventDefault()
    const ok = await change(target, () => banUser(target.id, reason.trim()), (u) => `${u.name} is banned and is logged out on their next request.`)
    if (ok) {
      setBanningId(null)
      setReason("")
    }
  }

  const handleUnban = (target: AdminUser) => change(target, () => unbanUser(target.id), (u) => `${u.name} can log in again.`)

  function startReset(id: number) {
    setResettingId(id)
    setBanningId(null)
    setResetResult(null)
    setError("")
    setNotice("")
  }

  async function handleReset(target: AdminUser) {
    setSavingId(target.id)
    setError("")
    setNotice("")
    try {
      const result = await resetPassword(target.id)
      setUsers((prev) => prev.map((u) => (u.id === result.user.id ? result.user : u)))
      setResetResult({ id: target.id, name: target.name, password: result.temporary_password })
      setCopied(false)
      setResettingId(null)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setSavingId(null)
    }
  }

  async function copyTemporary() {
    if (!resetResult) return
    try {
      await navigator.clipboard.writeText(resetResult.password)
      setCopied(true)
    } catch {
      setError("Could not copy. Select the password and copy it by hand.")
    }
  }

  function startBan(id: number) {
    setBanningId(id)
    setResettingId(null)
    setReason("")
    setError("")
    setNotice("")
  }

  async function exportCsv() {
    setExporting(true)
    setError("")
    try {
      saveFile(await exportUsersCsv({ q: query, role, status }), `users-${todayUtc()}.csv`)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setExporting(false)
    }
  }

  const filtered = Boolean(query || role || status)
  const allChecked = users.length > 0 && users.every((u) => checkedIds.includes(u.id))
  const toggleChecked = (id: number) =>
    setCheckedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  let body
  if (loading && users.length === 0) body = <p className="empty">Loading users…</p>
  else if (users.length === 0) body = <p className="empty">{filtered ? "No users match these filters." : "No users yet."}</p>
  else
    body = (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="check">
                <input
                  type="checkbox"
                  aria-label="Select all users shown"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = checkedIds.length > 0 && !allChecked
                  }}
                  onChange={() => setCheckedIds(allChecked ? [] : users.map((u) => u.id))}
                />
              </th>
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
                    <td className="check">
                      <input type="checkbox" aria-label={`Select ${u.name}`} checked={checkedIds.includes(u.id)} onChange={() => toggleChecked(u.id)} />
                    </td>
                    <td className="name">
                      <a href={usersLink(u.id)}>{u.name}</a>
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
                      <div className="actions">
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
                        {/* Like banning: not for yourself (use My account) or another admin. */}
                        {!isMe && u.role !== "admin" && (
                          <button onClick={() => startReset(u.id)} disabled={busy || resettingId === u.id}>
                            Reset password
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {resettingId === u.id && (
                    <tr className="ban-row">
                      <td colSpan={8}>
                        <div className="ban-form">
                          <span>
                            Reset {u.name}'s password? Their current password and every login stop working, and they
                            must choose a new password after logging in with the temporary one.
                          </span>
                          <button className="danger solid" onClick={() => handleReset(u)} disabled={busy}>
                            {busy ? "Resetting…" : "Reset password"}
                          </button>
                          <button onClick={() => setResettingId(null)} disabled={busy}>
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {resetResult?.id === u.id && (
                    <tr className="reset-row">
                      <td colSpan={8}>
                        <div className="reset-result" role="status">
                          <span>Temporary password for {resetResult.name}:</span>
                          <code className="temp-password">{resetResult.password}</code>
                          <button onClick={copyTemporary}>{copied ? "Copied" : "Copy"}</button>
                          <button onClick={() => setResetResult(null)}>Done</button>
                        </div>
                        <p className="hint">
                          Shown only this once. Give it to {resetResult.name} in person; they choose their own password
                          when they log in with it.
                        </p>
                      </td>
                    </tr>
                  )}
                  {banningId === u.id && (
                    <tr className="ban-row">
                      <td colSpan={8}>
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
        <select className="role-select" aria-label="Filter by role" value={role} onChange={(e) => setRole(e.target.value as UserFilters["role"])}>
          <option value="">Every role</option>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <select className="role-select" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value as UserFilters["status"])}>
          <option value="">Active and banned</option>
          <option value="active">Active</option>
          <option value="banned">Banned</option>
        </select>
        {can(me, "users:export") && (
          <button onClick={exportCsv} disabled={exporting || loading || total === 0}>
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        )}
      </div>
      <p className="hint">
        Everyone starts as a User. Make someone a Trainer to let them be picked for classes and see who booked them,
        or a Gym Manager to let them manage members. A banned user is locked out
        at once, and you can unban them later. Reset password gives someone who forgot theirs a temporary one. Tick
        several users to ban or unban them together, and click a name for their details, where you can also log them out
        of every browser.
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
      {checkedIds.length > 0 && (
        <UserBulkBar
          ids={checkedIds}
          onClear={() => setCheckedIds([])}
          onDone={(message) => {
            setNotice(message)
            setError("")
            // Reload: banned users may leave the current status filter, and the ticks are cleared.
            setReloadKey((k) => k + 1)
          }}
        />
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

// Admins only: the user list, or one user's details when the address names them (#/users?user=5).
export default function UsersPage() {
  const [userId, setUserId] = useState<number | null>(userFromHash)

  // Links inside the page change only the part after ?, so the page follows the address itself.
  useEffect(() => {
    const onChange = () => setUserId(userFromHash())
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [])

  return userId === null ? <UserList /> : <UserDetail key={userId} userId={userId} />
}
