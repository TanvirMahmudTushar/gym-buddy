import { useCallback, useEffect, useState } from "react"
import Alert from "../../components/Alert"
import AnnouncementsCard from "../../components/AnnouncementsCard"
import BarList from "../../components/BarList"
import PageHeader from "../../components/PageHeader"
import RevenueCard from "../../components/RevenueCard"
import Stat from "../../components/Stat"
import { useAuth } from "../../context/AuthContext"
import { getRevenue, getStats } from "../../services/adminService"
import { getOverview } from "../../services/overviewService"
import type { AdminStats } from "../../types/auth"
import type { Overview } from "../../types/overview"
import type { RevenueStats } from "../../types/payment"
import { can, usersLink } from "../../utils/auth"
import { equipmentLink } from "../../utils/equipment"
import { pageLink } from "../../utils/hash"
import { membersLink } from "../../utils/member"
import { formatMoney, paymentsLink } from "../../utils/payment"
import { count, errorText } from "../../utils/text"
import { formatClassTime, formatWeekday, gymToday, longToday } from "../../utils/time"
import { trainingLink } from "../../utils/workout"

// The front desk part: what needs attention today. Every number links to the list it counts.
function Today({ overview: o }: { overview: Overview }) {
  const today = gymToday()
  return (
    <section className="card">
      <h2>Today</h2>
      <div className="stats">
        <Stat label="In the gym now" value={o.inside_now} href="#/attendance?inside=1" />
        <Stat label="Checked in" value={o.check_ins_today} href="#/attendance" />
        <Stat label="Payments" value={formatMoney(o.payments_today.amount)} href={paymentsLink(today, today)} note={count(o.payments_today.count, "payment")} />
        <Stat label="Expiring in 7 days" value={o.expiring_soon} href={membersLink({ filter: "expiring_soon" })} />
        <Stat label="Waiting to join" value={o.waiting} href={membersLink({ filter: "waiting" })} />
        <Stat label="Equipment to fix" value={o.equipment_attention} alert href={equipmentLink("needs_attention")} />
        <Stat label="Services due" value={o.equipment_service_due} href={equipmentLink("service_due")} />
      </div>
    </section>
  )
}

function NextClasses({ classes }: { classes: Overview["next_classes"] }) {
  return (
    <section className="card">
      <div className="toolbar">
        <h2>Next classes</h2>
        <a href="#/classes">All classes</a>
      </div>
      {classes.length === 0 ? (
        <p className="empty">No upcoming classes. Add one on the Classes page.</p>
      ) : (
        <ul className="rows">
          {classes.map((c) => (
            <li key={c.id}>
              <span>
                <span className="row-title">{c.name}</span>
                <span className="hint">
                  {formatClassTime(c.starts_at)}
                  {c.trainer_name ? ` · ${c.trainer_name}` : ""}
                </span>
              </span>
              <span className={c.booked_count >= c.capacity ? "pill bad" : "pill good"}>
                {c.booked_count} / {c.capacity} booked
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// The admin part: how the whole gym is doing.
function GymReport({ stats: s, revenue }: { stats: AdminStats; revenue: RevenueStats }) {
  return (
    <>
      <RevenueCard revenue={revenue} />
      <div className="split">
        <section className="card">
          <div className="toolbar">
            <h2>Accounts</h2>
            <a href={usersLink()}>All users</a>
          </div>
          <div className="stats">
            <Stat label="Total" value={s.users.total} href={usersLink()} />
            <Stat label="New in 7 days" value={s.users.new_last_7_days} />
            <Stat label="Banned" value={s.users.banned} alert href={pageLink("users", { status: "banned" })} />
            <Stat label="Admins" value={s.users.admins} href={pageLink("users", { role: "admin" })} />
            <Stat label="Gym Managers" value={s.users.gym_managers} href={pageLink("users", { role: "gym_manager" })} />
            <Stat label="Trainers" value={s.users.trainers} href={pageLink("users", { role: "trainer" })} />
          </div>
        </section>
        <section className="card">
          <div className="toolbar">
            <h2>Members</h2>
            <a href={membersLink()}>All members</a>
          </div>
          <div className="stats">
            <Stat label="Total" value={s.members.total} href={membersLink()} />
            <Stat label="New in 7 days" value={s.members.new_last_7_days} />
            <Stat label="Active" value={s.members.active} href={membersLink({ filter: "active" })} />
            <Stat label="Expired" value={s.members.expired} href={membersLink({ filter: "expired" })} />
            <Stat label="Frozen" value={s.members.frozen} href={membersLink({ filter: "frozen" })} />
            <Stat label="Expiring soon" value={s.members.expiring_soon} href={membersLink({ filter: "expiring_soon" })} />
          </div>
        </section>
        <section className="card">
          <h2>Records and groups</h2>
          <div className="stats">
            <Stat label="Training groups" value={s.groups.total} href={trainingLink("all-groups")} />
            <Stat label="Workouts" value={s.workouts.total} href={trainingLink("all-workouts")} note={`${s.workouts.completed} done`} />
            <Stat label="New workouts, 7 days" value={s.workouts.last_7_days} />
            <Stat label="Upcoming classes" value={s.classes.upcoming} href="#/classes" />
            <Stat label="Equipment" value={s.equipment.total} href={equipmentLink("")} />
          </div>
        </section>
        <section className="card">
          <div className="toolbar">
            <h2>Check-ins, last 7 days</h2>
            <span className="hint">{s.check_ins.by_day.reduce((sum, d) => sum + d.count, 0)} in total</span>
          </div>
          <BarList bars={s.check_ins.by_day.map((d) => ({ key: d.day, name: formatWeekday(d.day), value: d.count, label: String(d.count) }))} />
        </section>
      </div>
    </>
  )
}

// The start page of gym managers and admins: today at the front desk, and for admins the whole gym's numbers below it.
export default function DashboardPage() {
  const { user } = useAuth()
  const isAdmin = can(user, "dashboard:read")
  const [overview, setOverview] = useState<Overview | null>(null)
  const [report, setReport] = useState<{ stats: AdminStats; revenue: RevenueStats } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  // Refresh also reloads the announcements, which load on their own.
  const [refreshKey, setRefreshKey] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [o, stats, revenue] = await Promise.all([getOverview(), isAdmin ? getStats() : null, isAdmin ? getRevenue() : null])
      setOverview(o)
      setReport(stats && revenue ? { stats, revenue } : null)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoading(false)
    }
  }, [isAdmin])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  return (
    <div className="page">
      <PageHeader title="Dashboard" subtitle={longToday()}>
        <button type="button" onClick={() => setRefreshKey((k) => k + 1)} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </PageHeader>
      <Alert>{error}</Alert>
      {!overview && loading && <p className="empty">Loading…</p>}
      {overview && (
        <>
          <Today overview={overview} />
          <div className="split">
            <NextClasses classes={overview.next_classes} />
            <AnnouncementsCard refreshKey={refreshKey} manageLink />
          </div>
        </>
      )}
      {report && <GymReport {...report} />}
    </div>
  )
}
