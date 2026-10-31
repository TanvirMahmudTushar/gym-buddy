import { useEffect, useState } from "react"
import { getMember } from "../api"
import { type Member, errorText, formatDate, memberStatus, planLabel } from "../members"
import StatusPill from "./StatusPill"

export default function MemberDetail({ memberId }: { memberId: number | null }) {
  const [member, setMember] = useState<Member | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // Read single: fetch the selected member by id whenever the selection changes.
  useEffect(() => {
    setMember(null)
    setError("")
    if (memberId === null) return
    let ignore = false
    setLoading(true)
    getMember(memberId)
      .then((m) => !ignore && setMember(m))
      .catch((err) => !ignore && setError(errorText(err)))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [memberId])

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
    </section>
  )
}
