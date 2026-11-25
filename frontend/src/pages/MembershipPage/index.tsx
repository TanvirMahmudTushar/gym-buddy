import { useEffect, useState } from "react"
import Alert from "../../components/Alert"
import AnnouncementsCard from "../../components/AnnouncementsCard"
import BookingsCard from "../../components/BookingsCard"
import MyPayments from "../../components/MyPayments"
import MyVisits from "../../components/MyVisits"
import PageHeader from "../../components/PageHeader"
import PlansCard from "../../components/PlansCard"
import StatusPill from "../../components/StatusPill"
import { useAuth } from "../../context/AuthContext"
import { usePlans } from "../../context/PlansContext"
import { getMe } from "../../services/authService"
import { cancelBooking } from "../../services/classService"
import { getMyMembership, listMyBookings } from "../../services/meService"
import type { Member } from "../../types/member"
import { memberStatus } from "../../utils/member"
import { errorText } from "../../utils/text"
import { daysBetween, formatDate, gymToday } from "../../utils/time"

/** "5 days left", "ends today" or "ended 3 days ago". */
function expiryNote(expiresOn: string): string {
  const days = daysBetween(gymToday(), expiresOn)
  if (days > 1) return `${days} days left`
  if (days === 1) return "ends tomorrow"
  if (days === 0) return "ends today"
  return days === -1 ? "ended yesterday" : `ended ${-days} days ago`
}

// A User's own membership, bookings, visits and payments. They can only ever see their own.
export default function MembershipPage() {
  const { user } = useAuth()
  const { planLabel } = usePlans()
  const [member, setMember] = useState<Member | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let ignore = false
    // Asked fresh, not taken from the login: staff may have started the membership since.
    getMe()
      .then((me) => (me.plan === null ? null : getMyMembership()))
      .then((m) => !ignore && setMember(m))
      .catch((err) => !ignore && setError(errorText(err)))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [])

  if (loading || error)
    return (
      <div className="page">
        <PageHeader title="My membership" />
        {error ? <Alert>{error}</Alert> : <p className="empty">Loading…</p>}
      </div>
    )

  if (!member)
    return (
      <div className="page">
        <PageHeader title="My membership" subtitle="You do not have a gym membership yet." />
        <div className="split">
          <div className="column">
            <section className="card">
              <h2>How to join</h2>
              <p>
                Ask the front desk to start a membership for <strong className="wrap-text">{user?.email}</strong>. It shows here as soon as they
                do.
              </p>
            </section>
            <PlansCard />
          </div>
          <AnnouncementsCard />
        </div>
      </div>
    )

  const status = memberStatus(member)
  return (
    <div className="page">
      <PageHeader
        title={
          <>
            My membership <StatusPill status={status} />
          </>
        }
      >
        <a className="button primary" href="#/timetable">
          Book a class
        </a>
      </PageHeader>
      {status === "expired" && <Alert kind="info">Your membership has expired. Renew it at the front desk to book classes.</Alert>}
      {status === "frozen" && <Alert kind="info">Your membership is frozen. Ask the front desk to unfreeze it to book classes.</Alert>}
      <div className="split">
        <div className="column">
          <section className="card">
            <h2>{planLabel(member.plan)}</h2>
            <dl className="facts">
              <dt>Joined</dt>
              <dd>{formatDate(member.joined_on)}</dd>
              <dt>Expires</dt>
              <dd>
                {formatDate(member.expires_on)} {status !== "frozen" && <span className="hint">({expiryNote(member.expires_on)})</span>}
              </dd>
              <dt>Trainer</dt>
              <dd>{member.trainer_name ?? "None"}</dd>
              <dt>Phone</dt>
              <dd>
                {member.phone ?? "Not given"} <a href="#/account">Change</a>
              </dd>
            </dl>
          </section>
          <BookingsCard
            title="My bookings"
            load={listMyBookings}
            cancel={cancelBooking}
            emptyText={
              <>
                You have no upcoming classes. <a href="#/timetable">Book one</a>
              </>
            }
          />
          <MyVisits />
        </div>
        <div className="column">
          <AnnouncementsCard />
          <PlansCard currentPlan={member.plan} />
          <MyPayments />
        </div>
      </div>
    </div>
  )
}
