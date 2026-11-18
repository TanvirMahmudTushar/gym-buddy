import { useEffect, useState } from "react"
import { useAuth } from "../../context/AuthContext"
import { changeRole, listUsers } from "../../services/userService"
import type { Role, User } from "../../types/auth"
import { ROLES } from "../../utils/auth"
import { errorText, formatDate } from "../../utils/member"

// Admins only: see everyone who has signed up and change their role.
export default function UsersPage() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState("")
  // The user whose role is being saved, so their dropdown is disabled meanwhile.
  const [savingId, setSavingId] = useState<number | null>(null)
  const [notice, setNotice] = useState("")

  useEffect(() => {
    let ignore = false
    listUsers(0)
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
  }, [])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const page = await listUsers(users.length)
      setUsers((prev) => [...prev, ...page.items])
      setTotal(page.total)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoadingMore(false)
    }
  }

  async function handleRoleChange(target: User, role: Role) {
    setSavingId(target.id)
    setError("")
    setNotice("")
    try {
      const updated = await changeRole(target.id, role)
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
      setNotice(`${updated.name} is now ${ROLES.find((r) => r.value === role)?.label}. They get the new access when they log in again.`)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setSavingId(null)
    }
  }

  let body
  if (loading) body = <p className="empty">Loading users…</p>
  else if (users.length === 0) body = <p className="empty">No users yet.</p>
  else
    body = (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="name">
                  {u.name}
                  {u.id === me?.id && <span className="hint"> (you)</span>}
                </td>
                <td>{u.email}</td>
                <td>
                  <select
                    className="role-select"
                    aria-label={`Role for ${u.name}`}
                    value={u.role}
                    // Your own role is locked so the system always keeps an admin.
                    disabled={u.id === me?.id || savingId === u.id}
                    onChange={(e) => handleRoleChange(u, e.target.value as Role)}
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{formatDate(u.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )

  return (
    <section className="card" aria-labelledby="users-heading">
      <h2 id="users-heading">Users and roles</h2>
      <p className="hint">Everyone starts as a User. Make someone a Gym Manager to let them manage members.</p>
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
