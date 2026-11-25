import { type FormEvent, useEffect, useState } from "react"
import { useAuth } from "../context/AuthContext"
import { useSave } from "../hooks/useSave"
import { addMember, removeMember, updateMember } from "../services/groupService"
import { listMyClients } from "../services/trainerService"
import type { Client } from "../types/gymClass"
import type { Group, GroupMember, MemberFlag } from "../types/workout"
import { can } from "../utils/auth"
import { MEMBER_FLAGS, canInGroup } from "../utils/workout"
import Alert from "./Alert"
import ConfirmModal from "./ConfirmModal"
import FormActions from "./FormActions"
import Icon from "./Icon"
import Modal from "./Modal"

const NO_FLAGS: Record<MemberFlag, boolean> = { can_create: false, can_update: false, can_assign: false }

/** The owner first, then everyone else by name, as the API lists them. */
const ordered = (list: GroupMember[]) =>
  [...list].sort((a, b) => Number(b.is_owner) - Number(a.is_owner) || a.name.localeCompare(b.name) || a.user_id - b.user_id)

interface AddProps {
  groupId: number
  members: GroupMember[]
  onAdded: (member: GroupMember) => void
  onCancel: () => void
}

// The owner adds an existing account by its email, with the permissions ticked. A trainer's own clients are suggested.
function AddPersonForm({ groupId, members, onAdded, onCancel }: AddProps) {
  const { user } = useAuth()
  const suggestClients = can(user, "clients:read")
  const [clients, setClients] = useState<Client[]>([])
  const [email, setEmail] = useState("")
  const [flags, setFlags] = useState(NO_FLAGS)
  const { saving, error, setError, run } = useSave()

  useEffect(() => {
    if (!suggestClients) return
    let ignore = false
    listMyClients(0, 100)
      .then((page) => !ignore && setClients(page.items))
      .catch(() => undefined) // the email can still be typed
    return () => {
      ignore = true
    }
  }, [suggestClients])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) return setError("Enter the email the person signed up with.")
    void run(async () => onAdded(await addMember(groupId, { email: email.trim(), ...flags })))
  }

  return (
    <form className="fields" onSubmit={handleSubmit} noValidate>
      <div className="field wide">
        <label htmlFor="group-add-email">Account email</label>
        <input id="group-add-email" list="my-clients" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} placeholder="rafi@example.com" autoComplete="off" autoFocus />
        <datalist id="my-clients">
          {clients
            .filter((c) => !members.some((m) => m.user_id === c.id))
            .map((c) => (
              <option key={c.id} value={c.email}>
                {c.name}
              </option>
            ))}
        </datalist>
        <span className="hint">They see the group straight away. Everyone in it sees its workouts; tick what else they may do.</span>
      </div>
      <div className="wide">
        {MEMBER_FLAGS.map((f) => (
          <label key={f.flag} className="checkbox-row" htmlFor={`group-add-${f.flag}`}>
            <input id={`group-add-${f.flag}`} type="checkbox" checked={flags[f.flag]} onChange={(e) => setFlags({ ...flags, [f.flag]: e.target.checked })} />
            {f.description}
          </label>
        ))}
      </div>
      <FormActions label="Add to group" saving={saving} error={error} onCancel={onCancel} />
    </form>
  )
}

interface Props {
  group: Group
  members: GroupMember[]
  meId: number
  onMembersChange: (members: GroupMember[]) => void
  /** Someone was removed: workouts assigned to them are now unassigned, so the list loads again. */
  onRemoved: () => void
}

// Who is in a group and what each person may do. The owner ticks the permissions, adds people by email and removes
// them; everyone else sees the same table read-only.
export default function GroupMembers({ group, members, meId, onMembersChange, onRemoved }: Props) {
  const isOwner = canInGroup(group, "manage")
  const { saving, error, run } = useSave()
  const [notice, setNotice] = useState("")
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<GroupMember | null>(null)

  const toggle = (m: GroupMember, flag: MemberFlag, value: boolean) =>
    run(async () => {
      setNotice("")
      const updated = await updateMember(group.id, m.user_id, { [flag]: value })
      onMembersChange(members.map((x) => (x.user_id === updated.user_id ? updated : x)))
    })

  return (
    <section className="card">
      <div className="toolbar">
        <div>
          <h2>People and permissions</h2>
          <p className="hint">{isOwner ? "Everyone sees the workouts. Tick what else each person may do; only you can delete." : "Only the owner can change these, and delete workouts."}</p>
        </div>
        {isOwner && (
          <button type="button" className="small primary" onClick={() => setAdding(true)}>
            <Icon name="plus" /> Add person
          </button>
        )}
      </div>
      <Alert>{error}</Alert>
      <Alert kind="success">{notice}</Alert>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Person</th>
              {MEMBER_FLAGS.map((f) => (
                <th key={f.flag} className="tick" title={f.description}>
                  {f.label}
                </th>
              ))}
              {isOwner && (
                <th className="act">
                  <span className="visually-hidden">Action</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.user_id}>
                <td className="name">
                  {m.name}
                  {m.user_id === meId && " (you)"} {m.is_owner && <span className="pill accent">Owner</span>}
                  {m.email && <span className="hint">{m.email}</span>}
                </td>
                {MEMBER_FLAGS.map((f) => (
                  <td key={f.flag} className="tick" data-label={f.label}>
                    <input
                      type="checkbox"
                      checked={m[f.flag]}
                      // The owner always holds every permission; only the owner changes anyone else's.
                      disabled={!isOwner || m.is_owner || saving}
                      onChange={(e) => toggle(m, f.flag, e.target.checked)}
                      aria-label={`${m.name}: ${f.description}`}
                    />
                  </td>
                ))}
                {isOwner && (
                  <td className="act">
                    {!m.is_owner && (
                      <div className="actions">
                        <button type="button" className="small danger" onClick={() => setRemoving(m)} disabled={saving}>
                          Remove
                        </button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {adding && (
        <Modal title="Add someone to the group" onClose={() => setAdding(false)}>
          <AddPersonForm
            groupId={group.id}
            members={members}
            onCancel={() => setAdding(false)}
            onAdded={(added) => {
              onMembersChange(ordered([...members, added]))
              setNotice(`${added.name} is now in the group.`)
              setAdding(false)
            }}
          />
        </Modal>
      )}
      {removing && (
        <ConfirmModal
          title={`Remove ${removing.name}?`}
          confirmLabel="Remove"
          busyLabel="Removing…"
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await removeMember(group.id, removing.user_id)
            onMembersChange(members.filter((x) => x.user_id !== removing.user_id))
            setNotice(`${removing.name} is no longer in the group.`)
            setRemoving(null)
            onRemoved()
          }}
        >
          They stop seeing the group, and workouts assigned to them become unassigned. The workouts they added stay.
        </ConfirmModal>
      )}
    </section>
  )
}
