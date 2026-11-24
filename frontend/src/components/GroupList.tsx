import { type FormEvent, useEffect, useState } from "react"
import { useAuth } from "../context/AuthContext"
import { createGroup, listGroups } from "../services/groupService"
import type { Group } from "../types/workout"
import { can } from "../utils/auth"
import { errorText } from "../utils/member"
import { canInGroup, groupLink } from "../utils/workout"

/** What I may do in a group, in a few words for the list. */
function myRole(group: Group): string {
  if (canInGroup(group, "manage")) return "Owner"
  const can = [canInGroup(group, "create") && "add", canInGroup(group, "update") && "edit", canInGroup(group, "assign") && "assign"].filter(Boolean)
  return can.length ? `Member: ${can.join(", ")}` : "Member: view only"
}

// The training groups I own or am in. Trainers and staff can start one, and own the ones they start.
export default function GroupList() {
  const { user } = useAuth()
  const canStart = can(user, "groups:create")
  const [groups, setGroups] = useState<Group[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState("")
  const [name, setName] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState("")

  useEffect(() => {
    let ignore = false
    listGroups(0)
      .then((page) => {
        if (ignore) return
        setGroups(page.items)
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
      const page = await listGroups(groups.length)
      setGroups((prev) => [...prev, ...page.items])
      setTotal(page.total)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoadingMore(false)
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setCreateError("Enter a name for the group.")
      return
    }
    setCreating(true)
    setCreateError("")
    try {
      const group = await createGroup(name.trim())
      // Open the new group, ready to add people.
      window.location.hash = groupLink(group.id)
    } catch (err) {
      setCreateError(errorText(err))
      setCreating(false)
    }
  }

  return (
    <section className="card" aria-labelledby="groups-heading">
      <h2 id="groups-heading">Training groups</h2>
      <p className="hint">
        {canStart
          ? "Members train together under a trainer. You own the groups you start: add members by email and tick what each one may do. Everyone in a group sees its workouts."
          : "The training groups your trainer added you to."}
      </p>
      {canStart && (
        <form className="inline" onSubmit={create} noValidate aria-label="Start a group">
          <div className="field">
            <label htmlFor="new-group-name">New group</label>
            <input
              id="new-group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              placeholder="Morning strength crew"
              autoComplete="off"
            />
          </div>
          <button className="primary" type="submit" disabled={creating}>
            {creating ? "Starting…" : "Start group"}
          </button>
        </form>
      )}
      {createError && (
        <p className="error" role="alert">
          {createError}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="empty">Loading your groups…</p>
      ) : groups.length === 0 ? (
        <p className="empty">{canStart ? "You have no groups yet. Start one above." : "You are not in a training group yet. Ask your trainer to add you."}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Group</th>
                <th>Owner</th>
                <th>People</th>
                <th>Workouts</th>
                <th>You</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <td className="name wrap">
                    <a href={groupLink(g.id)}>{g.name}</a>
                  </td>
                  <td>{canInGroup(g, "manage") ? "You" : g.owner_name}</td>
                  <td>{g.member_count}</td>
                  <td>{g.workout_count}</td>
                  <td>{myRole(g)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {groups.length > 0 && (
        <div className="list-foot">
          <span>
            Showing {groups.length} of {total}
          </span>
          {groups.length < total && (
            <button onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
