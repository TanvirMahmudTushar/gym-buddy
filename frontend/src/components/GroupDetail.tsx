import { type FormEvent, useCallback, useEffect, useState } from "react"
import { useAuth } from "../context/AuthContext"
import { usePagedList } from "../hooks/usePagedList"
import { useSave } from "../hooks/useSave"
import { ApiError } from "../services/api"
import { deleteGroup, getGroup, listMembers, removeMember, renameGroup } from "../services/groupService"
import { createWorkout, listGroupWorkouts } from "../services/workoutService"
import type { Group, GroupMember } from "../types/workout"
import { count, errorText } from "../utils/text"
import { canInGroup, myAccess, trainingLink } from "../utils/workout"
import Alert from "./Alert"
import ConfirmModal from "./ConfirmModal"
import FormActions from "./FormActions"
import GroupMembers from "./GroupMembers"
import Icon from "./Icon"
import ListState from "./ListState"
import Modal from "./Modal"
import PageHeader from "./PageHeader"
import Pager from "./Pager"
import WorkoutForm, { type WorkoutFormValues } from "./WorkoutForm"
import WorkoutItem from "./WorkoutItem"

const BACK = { href: trainingLink("groups"), label: "My groups" }

const goToList = () => {
  window.location.hash = trainingLink("groups")
}

// One training group: its workouts and its people. Every button follows my permissions in this group.
export default function GroupDetail({ groupId }: { groupId: number }) {
  const { user } = useAuth()
  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [error, setError] = useState("")
  const [dialog, setDialog] = useState<"add" | "rename" | "delete" | "leave" | null>(null)
  const [name, setName] = useState("")
  const save = useSave()
  const [reloadKey, setReloadKey] = useState(0)
  const reload = () => setReloadKey((k) => k + 1)

  const loadWorkouts = useCallback((id: number, offset: number) => listGroupWorkouts(id, offset), [])
  const list = usePagedList(loadWorkouts, groupId, reloadKey)

  useEffect(() => {
    let ignore = false
    Promise.all([getGroup(groupId), listMembers(groupId)])
      .then(([g, m]) => {
        if (ignore) return
        setGroup(g)
        setMembers(m)
      })
      // 404: no such group, or I am not (or no longer) in it.
      .catch(
        (err) =>
          !ignore && setError(err instanceof ApiError && err.status === 404 ? "This group does not exist, or you are not in it." : errorText(err)),
      )
    return () => {
      ignore = true
    }
  }, [groupId])

  function close() {
    setDialog(null)
    save.setError("")
  }

  if (!group)
    return (
      <div className="page">
        <PageHeader title="Training group" back={BACK} />
        {error ? <Alert>{error}</Alert> : <p className="empty">Loading…</p>}
      </div>
    )

  const isOwner = canInGroup(group, "manage")
  const canAssign = canInGroup(group, "assign")

  const addWorkout = (values: WorkoutFormValues) =>
    save.run(async () => {
      await createWorkout({ ...values, group_id: groupId })
      close()
      reload()
    })

  function rename(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return save.setError("Enter a name for the group.")
    void save.run(async () => {
      setGroup(await renameGroup(groupId, name.trim()))
      close()
    })
  }

  return (
    <div className="page">
      <PageHeader
        back={BACK}
        title={group.name}
        subtitle={
          <>
            Owner: {isOwner ? "you" : group.owner_name} · {count(members.length, "person", "people")} · Your access: {myAccess(group).toLowerCase()}
          </>
        }
      >
        {canInGroup(group, "create") && (
          <button type="button" className="primary" onClick={() => setDialog("add")}>
            <Icon name="plus" /> Add workout
          </button>
        )}
        {isOwner ? (
          <>
            <button
              type="button"
              onClick={() => {
                setName(group.name)
                setDialog("rename")
              }}
            >
              Rename
            </button>
            <button type="button" className="danger" onClick={() => setDialog("delete")}>
              Delete group
            </button>
          </>
        ) : (
          <button type="button" className="danger" onClick={() => setDialog("leave")}>
            Leave group
          </button>
        )}
      </PageHeader>
      <h2>Workouts {list.total > 0 && <span className="hint">({list.total})</span>}</h2>
      <ListState loading={list.loading} error={list.error} isEmpty={list.items.length === 0} empty="No workouts in this group yet.">
        <ul className="card-grid">
          {list.items.map((w) => (
            <WorkoutItem
              key={w.id}
              workout={w}
              meId={user?.id ?? 0}
              canEdit={canInGroup(group, "update")}
              canAssign={canAssign}
              members={members}
              onChanged={(updated) => list.replace((items) => items.map((x) => (x.id === updated.id ? updated : x)))}
              onDeleted={reload}
            />
          ))}
        </ul>
        <Pager {...list} onChange={list.goTo} />
      </ListState>
      <GroupMembers group={group} members={members} meId={user?.id ?? 0} onMembersChange={setMembers} onRemoved={reload} />

      {dialog === "add" && (
        <Modal title="Add a workout" onClose={close}>
          <WorkoutForm assignees={canAssign ? members : undefined} saving={save.saving} error={save.error} onSave={addWorkout} onCancel={close} />
        </Modal>
      )}
      {dialog === "rename" && (
        <Modal title="Rename the group" onClose={close} narrow>
          <form className="fields" onSubmit={rename} noValidate>
            <div className="field wide">
              <label htmlFor="group-name">Group name</label>
              <input id="group-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoFocus autoComplete="off" />
            </div>
            <FormActions label="Save name" saving={save.saving} error={save.error} onCancel={close} />
          </form>
        </Modal>
      )}
      {dialog === "delete" && (
        <ConfirmModal
          title={`Delete "${group.name}"?`}
          confirmLabel="Delete group"
          busyLabel="Deleting…"
          onClose={close}
          onConfirm={async () => {
            await deleteGroup(groupId)
            goToList()
          }}
        >
          Its {count(list.total, "workout")} are deleted and everyone in it loses access. This cannot be undone.
        </ConfirmModal>
      )}
      {dialog === "leave" && (
        <ConfirmModal
          title={`Leave "${group.name}"?`}
          confirmLabel="Leave group"
          busyLabel="Leaving…"
          onClose={close}
          onConfirm={async () => {
            await removeMember(groupId, user?.id ?? 0)
            goToList()
          }}
        >
          You stop seeing its workouts, and the ones assigned to you become unassigned. Only the owner can add you again.
        </ConfirmModal>
      )}
    </div>
  )
}
