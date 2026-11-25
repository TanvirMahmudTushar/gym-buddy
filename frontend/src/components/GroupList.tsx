import { type FormEvent, type ReactNode, useState } from "react"
import { useAuth } from "../context/AuthContext"
import { usePagedList } from "../hooks/usePagedList"
import { useSave } from "../hooks/useSave"
import { createGroup, listGroups } from "../services/groupService"
import { can } from "../utils/auth"
import { count } from "../utils/text"
import { canInGroup, groupLink, myAccess } from "../utils/workout"
import FormActions from "./FormActions"
import Icon from "./Icon"
import ListState from "./ListState"
import Modal from "./Modal"
import PageHeader from "./PageHeader"
import Pager from "./Pager"

const load = (_filters: null, offset: number) => listGroups(offset)

function StartGroupForm({ onCancel }: { onCancel: () => void }) {
  const [name, setName] = useState("")
  const { saving, error, setError, run } = useSave()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError("Enter a name for the group.")
    void run(async () => {
      const group = await createGroup(name.trim())
      // Open the new group, ready to add people.
      window.location.hash = groupLink(group.id)
    })
  }

  return (
    <form className="fields" onSubmit={handleSubmit} noValidate>
      <div className="field wide">
        <label htmlFor="new-group-name">Group name</label>
        <input id="new-group-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="Morning strength crew" autoComplete="off" autoFocus />
      </div>
      <FormActions label="Start group" saving={saving} error={error} onCancel={onCancel} />
    </form>
  )
}

// The training groups I own or am in. Trainers and staff can start one, and own the ones they start.
export default function GroupList({ tabs }: { tabs: ReactNode }) {
  const { user } = useAuth()
  const canStart = can(user, "groups:create")
  const list = usePagedList(load, null)
  const [starting, setStarting] = useState(false)

  return (
    <>
      <PageHeader
        title="Training"
        subtitle={canStart ? "You own the groups you start: add members and choose what each one may do." : "The training groups your trainer added you to."}
      >
        {canStart && (
          <button type="button" className="primary" onClick={() => setStarting(true)}>
            <Icon name="plus" /> Start group
          </button>
        )}
      </PageHeader>
      {tabs}
      <ListState
        loading={list.loading}
        error={list.error}
        isEmpty={list.items.length === 0}
        empty={canStart ? "You have no groups yet. Start the first one." : "You are not in a training group yet. Ask your trainer to add you."}
      >
        <ul className="card-grid">
          {list.items.map((g) => (
            <li key={g.id} className="item">
              <div className="item-head">
                <h2>
                  <a href={groupLink(g.id)}>{g.name}</a>
                </h2>
                <span className={canInGroup(g, "manage") ? "pill accent" : "pill info"}>{myAccess(g)}</span>
              </div>
              <div className="meta">
                <span>
                  <Icon name="members" /> {count(g.member_count, "person", "people")}
                </span>
                <span>
                  <Icon name="training" /> {count(g.workout_count, "workout")}
                </span>
                {!canInGroup(g, "manage") && (
                  <span>
                    <Icon name="users" /> Owner: {g.owner_name}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
        <Pager {...list} onChange={list.goTo} />
      </ListState>
      {starting && (
        <Modal title="Start a training group" onClose={() => setStarting(false)} narrow>
          <StartGroupForm onCancel={() => setStarting(false)} />
        </Modal>
      )}
    </>
  )
}
