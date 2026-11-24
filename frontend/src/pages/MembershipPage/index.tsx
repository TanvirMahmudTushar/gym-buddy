import { useEffect, useState } from "react"
import AnnouncementsCard from "../../components/AnnouncementsCard"
import BookingsSection from "../../components/BookingsSection"
import MyPayments from "../../components/MyPayments"
import PlansCard from "../../components/PlansCard"
import StatusPill from "../../components/StatusPill"
import { useAuth } from "../../context/AuthContext"
import { usePlans } from "../../context/PlansContext"
import { getMe } from "../../services/authService"
import { cancelBooking } from "../../services/classService"
import { getMyMembership, listMyBookings, listMyCheckIns } from "../../services/meService"
import type { CheckIn } from "../../types/checkIn"
import type { Member } from "../../types/member"
import { errorText, formatDate, formatDateTime, formatTime, memberStatus, todayUtc } from "../../utils/member"

const PAGE_SIZE = 10

/** "Expires in 12 days", "Expires today" or "Expired 3 days ago". */
function expiryNote(expiresOn: string): string {
  const days = Math.round((Date.parse(expiresOn) - Date.parse(todayUtc())) / 86_400_000)
  if (days > 365) return "Expires more than a year from now"
  if (days > 60) return `Expires in about ${Math.round(days / 30)} months`
  if (days > 1) return `Expires in ${days} days`
  if (days === 1) return "Expires tomorrow"
  if (days === 0) return "Expires today"
  return `Expired ${-days} day${days === -1 ? "" : "s"} ago`
}

// A User's own membership and visits. They can only ever see their own record.
export default function MembershipPage() {
  const { user } = useAuth()
  const { planLabel } = usePlans()
  const [member, setMember] = useState<Member | null>(null)
  const [noMembership, setNoMembership] = useState(false)
  const [visits, setVisits] = useState<CheckIn[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let ignore = false
    // Asked fresh, not taken from the login: staff may have started the membership since.
    getMe()
      .then((me) => (me.plan === null ? null : Promise.all([getMyMembership(), listMyCheckIns(0, PAGE_SIZE)])))
      .then((loaded) => {
        if (ignore) return
        if (loaded === null) {
          setNoMembership(true)
          return
        }
        const [m, page] = loaded
        setMember(m)
        setVisits(page.items)
        setTotal(page.total)
      })
      .catch((err) => !ignore && setError(errorText(err)))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [])

  async function showMore() {
    setLoadingMore(true)
    try {
      const page = await listMyCheckIns(visits.length, PAGE_SIZE)
      setVisits((prev) => [...prev, ...page.items])
      setTotal(page.total)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoadingMore(false)
    }
  }

  if (loading) return <p className="empty">Loading your membership…</p>

  if (noMembership)
    return (
      <div className="column narrow">
        <section className="card narrow-card" aria-labelledby="membership-heading">
          <h2 id="membership-heading">My membership</h2>
          <p>You do not have a gym membership yet.</p>
          <p className="hint">
            Ask the front desk to start one for {user ? <strong>{user.email}</strong> : "your account"}, then come back to
            this page.
          </p>
        </section>
        <AnnouncementsCard hideWhenEmpty />
        <PlansCard />
      </div>
    )

  if (error || !member)
    return (
      <p className="error" role="alert">
        {error || "Something went wrong"}
      </p>
    )

  const status = memberStatus(member)
  return (
    <div className="column narrow">
      <section className="card" aria-labelledby="membership-heading">
        <div className="toolbar">
          <h2 id="membership-heading">My membership</h2>
          <StatusPill status={status} />
        </div>
        <dl className="facts">
          <dt>Name</dt>
          <dd>{member.name}</dd>
          <dt>Plan</dt>
          <dd>{planLabel(member.plan)}</dd>
          <dt>Joined</dt>
          <dd>{formatDate(member.joined_on)}</dd>
          <dt>Expires</dt>
          <dd>{formatDate(member.expires_on)}</dd>
          {member.trainer_name && (
            <>
              <dt>Trainer</dt>
              <dd>{member.trainer_name}</dd>
            </>
          )}
          {member.phone && (
            <>
              <dt>Phone</dt>
              <dd>{member.phone}</dd>
            </>
          )}
        </dl>
        {status === "active" && <p className="hint">{expiryNote(member.expires_on)}.</p>}
        {status === "expired" && <p className="hint">Your membership has expired. Renew it at the front desk to book classes; the prices are below.</p>}
        {status === "frozen" && <p className="hint">Your membership is frozen. Ask the front desk to unfreeze it to book classes.</p>}
        <p className="hint">
          <a href="#/account">Keep your phone, date of birth and emergency contact up to date</a> on My account.
        </p>
      </section>
      <AnnouncementsCard hideWhenEmpty />
      <section className="card" aria-labelledby="visits-heading">
        <h2 id="visits-heading">My visits {total > 0 && <span className="hint">({total})</span>}</h2>
        {visits.length === 0 ? (
          <p className="empty">No visits yet.</p>
        ) : (
          <ul className="visit-list">
            {visits.map((v) => (
              <li key={v.id}>
                <span>
                  {formatDateTime(v.checked_in_at)}
                  {v.checked_out_at && ` to ${formatTime(v.checked_out_at)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
        {visits.length < total && (
          <button type="button" onClick={showMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Show older visits"}
          </button>
        )}
      </section>
      <BookingsSection
        variant="card"
        title="My bookings"
        load={listMyBookings}
        cancel={cancelBooking}
        emptyText="You have no upcoming classes."
        footer={
          <p className="hint">
            <a href="#/timetable">Book a class</a>
          </p>
        }
      />
      <PlansCard currentPlan={member.plan} />
      <MyPayments />
    </div>
  )
}
