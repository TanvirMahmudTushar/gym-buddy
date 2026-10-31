import { useEffect, useState } from "react"
import { deleteMember, getMember, updateMember } from "../api"
import { type Member, type MemberUpdate, errorText, formatDate, memberStatus, planLabel } from "../members"
import EditMemberForm from "./EditMemberForm"
import StatusPill from "./StatusPill"

interface Props {
  memberId: number | null
  onChanged: (member: Member) => void
  onDeleted: () => void
}

export default function MemberDetail({ memberId, onChanged, onDeleted }: Props) {
  const [member, setMember] = useState<Member | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [renewDate, setRenewDate] = useState("")
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState("")

  // Read single: fetch the selected member by id whenever the selection changes.
  useEffect(() => {
    setMember(null)
    setError("")
    setEditing(false)
    setConfirmingDelete(false)
    setActionError("")
    if (memberId === null) return
    let ignore = false
    setLoading(true)
    getMember(memberId)
      .then((m) => {
        if (ignore) return
        setMember(m)
        setRenewDate(m.expires_on)
      })
      .catch((err) => !ignore && setError(errorText(err)))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [memberId])

  // Update: send only the changed fields, then show the saved member and refresh the list.
  async function save(changes: MemberUpdate) {
    if (!member) return
    setBusy(true)
    setActionError("")
    try {
      const updated = await updateMember(member.id, changes)
      setMember(updated)
      setRenewDate(updated.expires_on)
      setEditing(false)
      onChanged(updated)
    } catch (err) {
      setActionError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  function renew() {
    if (!member) return
    if (!renewDate || renewDate < member.joined_on) {
      setActionError(`Pick an expiry date on or after ${formatDate(member.joined_on)}.`)
      return
    }
    save({ expires_on: renewDate })
  }

  async function remove() {
    if (!member) return
    setBusy(true)
    setActionError("")
    try {
      await deleteMember(member.id)
      onDeleted()
    } catch (err) {
      setActionError(errorText(err))
      setBusy(false)
    }
  }

  if (memberId === null)
    return (
      <section className="card panel">
        <h2>Member details</h2>
        <p className="empty">Select a member to see their details.</p>
      </section>
    )

  if (loading || !member)
    return (
      <section className="card panel">
        <h2>Member details</h2>
        {error ? <p className="error">{error}</p> : <p className="empty">Loading…</p>}
      </section>
    )

  if (editing)
    return (
      <section className="card panel" aria-labelledby="edit-heading">
        <div className="detail-head">
          <h2 id="edit-heading">Edit member</h2>
          <StatusPill status={memberStatus(member)} />
        </div>
        <EditMemberForm
          member={member}
          saving={busy}
          onSave={save}
          onCancel={() => {
            setEditing(false)
            setActionError("")
          }}
        />
        {actionError && <p className="error">{actionError}</p>}
      </section>
    )

  return (
    <section className="card panel" aria-labelledby="detail-heading">
      <div className="detail-head">
        <h2 id="detail-heading">{member.full_name}</h2>
        <StatusPill status={memberStatus(member)} />
      </div>
      <dl>
        <dt>ID</dt>
        <dd>{member.id}</dd>
        <dt>Phone</dt>
        <dd>{member.phone || "Not provided"}</dd>
        <dt>Plan</dt>
        <dd>{planLabel(member.plan)}</dd>
        <dt>Joined</dt>
        <dd>{formatDate(member.joined_on)}</dd>
        <dt>Expires</dt>
        <dd>{formatDate(member.expires_on)}</dd>
        <dt>Notes</dt>
        <dd>{member.notes || "None"}</dd>
      </dl>
      <hr className="separator" />
      <div className="inline">
        <div className="field">
          <label htmlFor="renew-date">Renew until</label>
          <input
            id="renew-date"
            type="date"
            value={renewDate}
            min={member.joined_on}
            onChange={(e) => setRenewDate(e.target.value)}
          />
        </div>
        <button type="button" onClick={renew} disabled={busy || renewDate === member.expires_on}>
          Renew
        </button>
      </div>
      <div className="actions">
        <button
          type="button"
          onClick={() => {
            setEditing(true)
            setConfirmingDelete(false)
            setActionError("")
          }}
          disabled={busy}
        >
          Edit
        </button>
        <button type="button" onClick={() => save({ is_active: !member.is_active })} disabled={busy}>
          {member.is_active ? "Freeze" : "Unfreeze"}
        </button>
        <button type="button" className="danger" onClick={() => setConfirmingDelete(true)} disabled={busy}>
          Delete
        </button>
      </div>
      {confirmingDelete && (
        <div className="confirm" role="alertdialog" aria-labelledby="confirm-text">
          <span id="confirm-text">Delete {member.full_name}? This cannot be undone.</span>
          <div className="actions">
            <button type="button" className="danger solid" onClick={remove} disabled={busy}>
              {busy ? "Deleting…" : "Yes, delete"}
            </button>
            <button type="button" onClick={() => setConfirmingDelete(false)} disabled={busy}>
              Keep member
            </button>
          </div>
        </div>
      )}
      {actionError && <p className="error">{actionError}</p>}
    </section>
  )
}
