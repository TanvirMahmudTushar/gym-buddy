import { type FormEvent, useCallback, useEffect, useState } from "react"
import { useAuth } from "../context/AuthContext"
import { deleteGroup, getGroup, listMembers, removeMember, renameGroup } from "../services/groupService"
import { ApiError } from "../services/api"
import { createWorkout, listGroupWorkouts } from "../services/workoutService"
import type { Group, GroupMember, Workout } from "../types/workout"
import { errorText } from "../utils/member"
import { canInGroup, groupLink } from "../utils/workout"
import GroupMembers from "./GroupMembers"
import WorkoutForm, { type WorkoutFormValues } from "./WorkoutForm"
import WorkoutItem from "./WorkoutItem"

interface Props {
  groupId: number
}

/** "You can add, edit and assign workouts" from my permissions in the group. */
function permissionSummary(group: Group): string {
  if (canInGroup(group, "manage")) return "You own this group: you can do everything, and decide what everyone else may do."
  const can = [canInGroup(group, "create") && "add", canInGroup(group, "update") && "edit", canInGroup(group, "assign") && "assign"].filter(Boolean)
  if (can.length === 0) return "You can see the group's workouts. Ask the owner if you need to add or change them."
  const list = can.length === 1 ? can[0] : `${can.slice(0, -1).join(", ")} and ${can[can.length - 1]}`
  return `You can see, ${list} the group's workouts.`
}

const goToList = () => {
  window.location.hash = groupLink(null)
}

// One training group: its workouts and its people. Every button follows my permissions in this group.
export default function GroupDetail({ groupId }: Props) {
  const { user } = useAuth()
  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [workoutTotal, setWorkoutTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState("")
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState("")
  const [confirming, setConfirming] = useState<"delete" | "leave" | null>(null)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [formKey, setFormKey] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [g, m, w] = await Promise.all([getGroup(groupId), listMembers(groupId), listGroupWorkouts(groupId, 0)])
      setGroup(g)
      setMembers(m)
      setWorkouts(w.items)
      setWorkoutTotal(w.total)
    } catch (err) {
      // 404: no such group, or I am not (or no longer) in it.
      if (err instanceof ApiError && err.status === 404) setNotFound(true)
      else setError(errorText(err))
    } finally {
      setLoading(false)
    }
  }, [groupId])

  useEffect(() => {
    void load()
  }, [load])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const page = await listGroupWorkouts(groupId, workouts.length)
      setWorkouts((prev) => [...prev, ...page.items])
      setWorkoutTotal(page.total)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoadingMore(false)
    }
  }

  async function addWorkout(values: WorkoutFormValues) {
    setSaving(true)
    setSaveError("")
    try {
      await createWorkout({ ...values, group_id: groupId })
      setFormKey((k) => k + 1)
      const page = await listGroupWorkouts(groupId, 0)
      setWorkouts(page.items)
      setWorkoutTotal(page.total)
    } catch (err) {
      setSaveError(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  async function rename(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError("Enter a name for the group.")
      return
    }
    setBusy(true)
    setError("")
    try {
      setGroup(await renameGroup(groupId, name.trim()))
      setRenaming(false)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function finish(action: () => Promise<void>) {
    setBusy(true)
    setError("")
    try {
      await action()
      goToList()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  if (loading && !group) return <p className="empty">Loading the group…</p>
  if (notFound)
    return (
      <section className="card">
        <h2>Group not found</h2>
        <p className="empty">This group does not exist, or you are not in it.</p>
        <a href={groupLink(null)}>Back to my groups</a>
      </section>
    )
  if (!group)
    return (
      <p className="error" role="alert">
        {error}
      </p>
    )

  const isOwner = canInGroup(group, "manage")
  const canAssign = canInGroup(group, "assign")

  return (
    <div className="column">
      <section className="card" aria-labelledby="group-heading">
        <div className="toolbar">
          {renaming ? (
            <form className="inline" onSubmit={rename} noValidate>
              <div className="field">
                <label htmlFor="group-name">Group name</label>
                <input id="group-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoFocus autoComplete="off" />
              </div>
              <button className="primary" type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save name"}
              </button>
              <button type="button" onClick={() => setRenaming(false)} disabled={busy}>
                Cancel
              </button>
            </form>
          ) : (
            <h2 id="group-heading" className="wrap-text">
              {group.name}
            </h2>
          )}
          <a href={groupLink(null)}>All my groups</a>
        </div>
        <p className="hint">
          Owner: {isOwner ? "you" : group.owner_name} · {group.member_count} {group.member_count === 1 ? "person" : "people"} ·{" "}
          {workoutTotal} workout{workoutTotal === 1 ? "" : "s"}
        </p>
        <p>{permissionSummary(group)}</p>
        <div className="actions">
          {isOwner ? (
            <>
              {!renaming && (
                <button
                  type="button"
                  onClick={() => {
                    setName(group.name)
                    setRenaming(true)
                  }}
                >
                  Rename
                </button>
              )}
              <button type="button" className="danger" onClick={() => setConfirming("delete")} disabled={busy}>
                Delete group
              </button>
            </>
          ) : (
            <button type="button" className="danger" onClick={() => setConfirming("leave")} disabled={busy}>
              Leave group
            </button>
          )}
        </div>
        {confirming && (
          <div className="confirm" role="alertdialog" aria-labelledby="confirm-group">
            <span id="confirm-group">
              {confirming === "delete"
                ? `Delete "${group.name}" with all its ${workoutTotal} workouts? Everyone in it loses access. This cannot be undone.`
                : `Leave "${group.name}"? You stop seeing its workouts, and the ones assigned to you become unassigned. Only the owner can add you again.`}
            </span>
            <div className="actions">
              <button
                type="button"
                className="danger solid"
                disabled={busy}
                onClick={() => finish(() => (confirming === "delete" ? deleteGroup(groupId) : removeMember(groupId, user?.id ?? 0)))}
              >
                {busy ? "Working…" : confirming === "delete" ? "Yes, delete the group" : "Yes, leave"}
              </button>
              <button type="button" onClick={() => setConfirming(null)} disabled={busy}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>

      <section className="card" aria-labelledby="group-workouts-heading">
        <h2 id="group-workouts-heading">Workouts</h2>
        {canInGroup(group, "create") && (
          <WorkoutForm key={formKey} assignees={canAssign ? members : undefined} saving={saving} error={saveError} onSave={addWorkout} />
        )}
        {workouts.length === 0 ? (
          <p className="empty">No workouts in this group yet.</p>
        ) : (
          <ul className="class-list">
            {workouts.map((w) => (
              <WorkoutItem
                key={w.id}
                workout={w}
                canEdit={canInGroup(group, "update")}
                canAssign={canAssign}
                members={members}
                onChanged={(updated) => setWorkouts((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))}
                onDeleted={(id) => {
                  setWorkouts((prev) => prev.filter((x) => x.id !== id))
                  setWorkoutTotal((n) => n - 1)
                }}
              />
            ))}
          </ul>
        )}
        {workouts.length > 0 && (
          <div className="list-foot">
            <span>
              Showing {workouts.length} of {workoutTotal}
            </span>
            {workouts.length < workoutTotal && (
              <button onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            )}
          </div>
        )}
      </section>

      <GroupMembers
        group={group}
        members={members}
        meId={user?.id ?? 0}
        onMembersChange={(next) => {
          setMembers(next)
          setGroup((g) => (g ? { ...g, member_count: next.length } : g))
        }}
      />
    </div>
  )
}
