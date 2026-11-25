import { useCallback, useEffect, useState } from "react"
import { usePlans } from "../context/PlansContext"
import { useSave } from "../hooks/useSave"
import { ApiError } from "../services/api"
import { cancelMemberBooking, deleteMember, getMember, listMemberBookings, updateMember } from "../services/memberService"
import type { Member, MemberUpdate } from "../types/member"
import { expiresSoonNote, memberStatus, membersLink } from "../utils/member"
import { birthDateText, emergencyContactText } from "../utils/profile"
import { errorText } from "../utils/text"
import { formatDate } from "../utils/time"
import Alert from "./Alert"
import BookingsCard from "./BookingsCard"
import CheckInCard from "./CheckInCard"
import ConfirmModal from "./ConfirmModal"
import EditMemberForm from "./EditMemberForm"
import Modal from "./Modal"
import PageHeader from "./PageHeader"
import PaymentCard from "./PaymentCard"
import StatusPill from "./StatusPill"

const BACK = { href: membersLink(), label: "All members" }

// One member: the membership and contact details, with their visits, bookings and payments.
export default function MemberDetail({ memberId }: { memberId: number }) {
  const { planLabel } = usePlans()
  const [member, setMember] = useState<Member | null>(null)
  const [loadError, setLoadError] = useState("")
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null)
  const { saving, error, setError, run } = useSave()

  const load = useCallback(async () => {
    try {
      setMember(await getMember(memberId))
    } catch (err) {
      setLoadError(err instanceof ApiError && err.status === 404 ? "This member does not exist. Their account may have been deleted." : errorText(err))
    }
  }, [memberId])

  useEffect(() => {
    void load()
  }, [load])

  const save = (changes: MemberUpdate) =>
    run(async () => {
      setMember(await updateMember(memberId, changes))
      setDialog(null)
    })

  if (!member)
    return (
      <div className="page">
        <PageHeader title="Member" back={BACK} />
        {loadError ? <Alert>{loadError}</Alert> : <p className="empty">Loading…</p>}
      </div>
    )

  const soon = expiresSoonNote(member)
  return (
    <div className="page">
      <PageHeader
        back={BACK}
        title={
          <>
            {member.name} <StatusPill status={memberStatus(member)} />
          </>
        }
        subtitle={member.email}
      >
        <button type="button" onClick={() => setDialog("edit")}>
          Edit
        </button>
        <button type="button" onClick={() => save({ is_frozen: !member.is_frozen })} disabled={saving}>
          {member.is_frozen ? "Unfreeze" : "Freeze"}
        </button>
        <button type="button" className="danger" onClick={() => setDialog("delete")}>
          Delete
        </button>
      </PageHeader>
      {dialog === null && <Alert>{error}</Alert>}
      <div className="split">
        <div className="column">
          <section className="card">
            <h2>Membership</h2>
            <dl className="facts">
              <dt>Plan</dt>
              <dd>{planLabel(member.plan)}</dd>
              <dt>Joined</dt>
              <dd>{formatDate(member.joined_on)}</dd>
              <dt>Expires</dt>
              <dd>
                {formatDate(member.expires_on)} {soon && <span className="hint">({soon})</span>}
              </dd>
              <dt>Trainer</dt>
              <dd>{member.trainer_name ?? "None"}</dd>
              <dt>Notes</dt>
              <dd className="prose">{member.notes || "None"}</dd>
            </dl>
          </section>
          <section className="card">
            <h2>Contact</h2>
            <dl className="facts">
              <dt>Phone</dt>
              <dd>{member.phone || "Not given"}</dd>
              <dt>Date of birth</dt>
              <dd>{member.date_of_birth ? birthDateText(member.date_of_birth) : "Not given"}</dd>
              <dt>Emergency</dt>
              <dd>{emergencyContactText(member) ?? "Not given"}</dd>
            </dl>
          </section>
          <PaymentCard member={member} onRenewed={load} />
        </div>
        <div className="column">
          <CheckInCard member={member} />
          <BookingsCard
            title="Bookings"
            load={(when, offset, limit) => listMemberBookings(memberId, when, offset, limit)}
            cancel={(classId) => cancelMemberBooking(memberId, classId)}
            emptyText="No upcoming classes booked."
          />
        </div>
      </div>
      {dialog === "edit" && (
        <Modal
          title={`Edit ${member.name}`}
          onClose={() => {
            setDialog(null)
            setError("")
          }}
        >
          <EditMemberForm
            member={member}
            saving={saving}
            error={error}
            onSave={save}
            onCancel={() => {
              setDialog(null)
              setError("")
            }}
          />
        </Modal>
      )}
      {dialog === "delete" && (
        <ConfirmModal
          title={`Delete ${member.name}'s account?`}
          confirmLabel="Delete account"
          busyLabel="Deleting…"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await deleteMember(memberId)
            window.location.hash = membersLink()
          }}
        >
          They can no longer log in, and their check-ins and bookings are removed. Payments stay on record. This cannot be undone.
        </ConfirmModal>
      )}
    </div>
  )
}
