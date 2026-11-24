import { type FormEvent, useEffect, useState } from "react"
import { useAuth } from "../context/AuthContext"
import { addMember, removeMember, updateMember } from "../services/groupService"
import { listMyClients } from "../services/trainerService"
import type { Client } from "../types/gymClass"
import type { Group, GroupMember, MemberFlag } from "../types/workout"
import { can } from "../utils/auth"
import { errorText } from "../utils/member"
import { MEMBER_FLAGS, canInGroup } from "../utils/workout"

interface Props {
  group: Group
  members: GroupMember[]
  meId: number
  onMembersChange: (members: GroupMember[]) => void
}

const NO_FLAGS: Record<MemberFlag, boolean> = { can_create: false, can_update: false, can_assign: false }

/** The owner first, then everyone else by name, as the API lists them. */
const ordered = (list: GroupMember[]) =>
  [...list].sort((a, b) => Number(b.is_owner) - Number(a.is_owner) || a.name.localeCompare(b.name) || a.user_id - b.user_id)

// Who is in a group and what each person may do. The owner ticks the permissions, adds people by email and removes
// them; everyone else sees the same table read-only.
export default function GroupMembers({ group, members, meId, onMembersChange }: Props) {
  const isOwner = canInGroup(group, "manage")
  const { user } = useAuth()
  // A trainer's own clients are suggested in the email box.
  const suggestClients = isOwner && can(user, "clients:read")
  const [clients, setClients] = useState<Client[]>([])
  const [busyId, setBusyId] = useState<number | null>(null)
  const [removingId, setRemovingId] = useState<number | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [email, setEmail] = useState("")
  const [flags, setFlags] = useState(NO_FLAGS)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState("")

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

  async function toggle(m: GroupMember, flag: MemberFlag, value: boolean) {
    setBusyId(m.user_id)
    setError("")
    setNotice("")
    try {
      const updated = await updateMember(group.id, m.user_id, { [flag]: value })
      onMembersChange(members.map((x) => (x.user_id === updated.user_id ? updated : x)))
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusyId(null)
    }
  }

  async function remove(m: GroupMember) {
    setBusyId(m.user_id)
    setError("")
    try {
      await removeMember(group.id, m.user_id)
      onMembersChange(members.filter((x) => x.user_id !== m.user_id))
      setNotice(`${m.name} is no longer in the group. Workouts assigned to them are now unassigned.`)
      setRemovingId(null)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusyId(null)
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) {
      setAddError("Enter the email the person signed up with.")
      return
    }
    setAdding(true)
    setAddError("")
    setNotice("")
    try {
      const added = await addMember(group.id, { email: email.trim(), ...flags })
      onMembersChange(ordered([...members, added]))
      setNotice(`${added.name} is now in the group.`)
      setEmail("")
      setFlags(NO_FLAGS)
    } catch (err) {
      setAddError(errorText(err))
    } finally {
      setAdding(false)
    }
  }

  return (
    <section className="card" aria-labelledby="group-members-heading">
      <h2 id="group-members-heading">People and permissions</h2>
      <p className="hint">
        Everyone in the group sees its workouts. {MEMBER_FLAGS.map((f) => `${f.label}: ${f.description.toLowerCase()}`).join(". ")}.
        {isOwner ? " Tick a box to change it straight away." : " Only the owner can change these."}
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
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              {isOwner && <th>Email</th>}
              {MEMBER_FLAGS.map((f) => (
                <th key={f.flag} className="check" title={f.description}>
                  {f.label}
                </th>
              ))}
              {isOwner && <th>Action</th>}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const busy = busyId === m.user_id
              return (
                <tr key={m.user_id}>
                  <td className="name">
                    {m.name}
                    {m.user_id === meId && <span className="hint"> (you)</span>}
                    {m.is_owner && (
                      <>
                        {" "}
                        <span className="pill frozen">Owner</span>
                      </>
                    )}
                  </td>
                  {isOwner && <td>{m.email}</td>}
                  {MEMBER_FLAGS.map((f) => (
                    <td key={f.flag} className="check">
                      <input
                        type="checkbox"
                        checked={m[f.flag]}
                        // The owner always holds every permission; only the owner changes anyone else's.
                        disabled={!isOwner || m.is_owner || busy}
                        onChange={(e) => toggle(m, f.flag, e.target.checked)}
                        aria-label={`${m.name}: ${f.description}`}
                      />
                    </td>
                  ))}
                  {isOwner && (
                    <td>
                      {m.is_owner ? (
                        <span className="hint">—</span>
                      ) : removingId === m.user_id ? (
                        <div className="actions">
                          <button type="button" className="danger solid" onClick={() => remove(m)} disabled={busy}>
                            {busy ? "Removing…" : `Remove ${m.name}`}
                          </button>
                          <button type="button" onClick={() => setRemovingId(null)} disabled={busy}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button type="button" className="danger" onClick={() => setRemovingId(m.user_id)} disabled={busy}>
                          Remove
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {isOwner && (
        <form className="filters" onSubmit={add} noValidate aria-label="Add someone to the group">
          <div className="field">
            <label htmlFor="group-add-email">Add someone by email</label>
            <input
              id="group-add-email"
              list="my-clients"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={254}
              placeholder="rafi@example.com"
              autoComplete="off"
            />
            <datalist id="my-clients">
              {clients
                .filter((c) => !members.some((m) => m.user_id === c.id))
                .map((c) => (
                  <option key={c.id} value={c.email}>
                    {c.name}
                  </option>
                ))}
            </datalist>
          </div>
          {MEMBER_FLAGS.map((f) => (
            <label key={f.flag} className="checkbox-row" htmlFor={`group-add-${f.flag}`}>
              <input
                id={`group-add-${f.flag}`}
                type="checkbox"
                checked={flags[f.flag]}
                onChange={(e) => setFlags({ ...flags, [f.flag]: e.target.checked })}
              />
              {f.description}
            </label>
          ))}
          <div className="actions">
            <button className="primary" type="submit" disabled={adding}>
              {adding ? "Adding…" : "Add to group"}
            </button>
          </div>
        </form>
      )}
      {isOwner && <p className="hint">The person must have an account already. There are no invitations: they see the group straight away.</p>}
      {addError && (
        <p className="error" role="alert">
          {addError}
        </p>
      )}
    </section>
  )
}
