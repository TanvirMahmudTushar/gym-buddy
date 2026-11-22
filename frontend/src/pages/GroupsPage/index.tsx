import { type FormEvent, useEffect, useState } from "react"
import GroupDetail from "../../components/GroupDetail"
import { createGroup, listGroups } from "../../services/groupService"
import type { Group } from "../../types/workout"
import { errorText, hashParams } from "../../utils/member"
import { canInGroup, groupLink } from "../../utils/workout"

/** The group named in the address (#/groups?group=5), or null for the list. */
function groupFromHash(): number | null {
  const id = Number(hashParams().get("group"))
  return Number.isInteger(id) && id > 0 ? id : null
}

/** What I may do in a group, in a few words for the list. */
function myRole(group: Group): string {
  if (canInGroup(group, "manage")) return "Owner"
  const can = [canInGroup(group, "create") && "add", canInGroup(group, "update") && "edit", canInGroup(group, "assign") && "assign"].filter(Boolean)
  return can.length ? `Member: ${can.join(", ")}` : "Member: view only"
}

// The groups I own or am in, and a form to start one. I become the owner of a group I start.
function GroupList() {
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
        Share workouts with a group. The person who starts a group owns it: they add people by email and tick what each
        one may do. Everyone in the group sees its workouts.
      </p>
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
        <p className="empty">You are not in any group yet. Start one above, or ask a group's owner to add you.</p>
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

// Everyone: my training groups, or one group when the address names it (#/groups?group=5).
export default function GroupsPage() {
  const [groupId, setGroupId] = useState<number | null>(groupFromHash)

  // Links inside the page change only the part after ?, so the page follows the address itself.
  useEffect(() => {
    const onChange = () => setGroupId(groupFromHash())
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [])

  return groupId === null ? <GroupList /> : <GroupDetail key={groupId} groupId={groupId} />
}
