import { useCallback, useEffect, useState } from "react"
import AnnouncementsCard from "../../components/AnnouncementsCard"
import BarList from "../../components/BarList"
import FrontDesk from "../../components/FrontDesk"
import RevenueCard from "../../components/RevenueCard"
import Stat from "../../components/Stat"
import { useAuth } from "../../context/AuthContext"
import { getRevenue, getStats } from "../../services/adminService"
import { getOverview } from "../../services/overviewService"
import type { AdminStats } from "../../types/auth"
import type { Overview } from "../../types/overview"
import type { RevenueStats } from "../../types/payment"
import { can } from "../../utils/auth"
import { errorText } from "../../utils/member"
import { trainingLink } from "../../utils/workout"

const dayName = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })

// The admin part: how the whole gym is doing.
function GymReport({ stats, revenue }: { stats: AdminStats; revenue: RevenueStats }) {
  return (
    <>
      <RevenueCard revenue={revenue} />
      <section className="card" aria-labelledby="stats-members">
        <div className="toolbar">
          <h2 id="stats-members">Members</h2>
          <a href="#/members">All members</a>
        </div>
        <dl className="stats">
          <Stat label="Total" value={stats.members.total} />
          <Stat label="Active" value={stats.members.active} href="#/members?filter=active" />
          <Stat label="Expired" value={stats.members.expired} href="#/members?filter=expired" />
          <Stat label="Frozen" value={stats.members.frozen} href="#/members?filter=frozen" />
          <Stat label="New in the last 7 days" value={stats.members.new_last_7_days} />
        </dl>
      </section>
      <section className="card" aria-labelledby="stats-attendance">
        <div className="toolbar">
          <h2 id="stats-attendance">Attendance, last 7 days</h2>
          <a href="#/attendance">Attendance</a>
        </div>
        <BarList
          bars={stats.check_ins.by_day.map((d) => ({ key: d.day, name: dayName(d.day), value: d.count, label: String(d.count) }))}
        />
      </section>
      <section className="card" aria-labelledby="stats-gym">
        <h2 id="stats-gym">Classes, training and equipment</h2>
        <dl className="stats">
          <Stat label="Upcoming classes" value={stats.classes.upcoming} href="#/classes" />
          <Stat label="Training groups" value={stats.groups.total} href={trainingLink("all-groups")} />
          <Stat
            label="Workouts"
            value={stats.workouts.total}
            href={trainingLink("all-workouts")}
            note={`${stats.workouts.completed} done · ${stats.workouts.last_7_days} new in 7 days`}
          />
          <Stat label="Equipment" value={stats.equipment.total} href="#/equipment" />
        </dl>
      </section>
      <section className="card" aria-labelledby="stats-users">
        <div className="toolbar">
          <h2 id="stats-users">Accounts</h2>
          <a href="#/users">Users and staff</a>
        </div>
        <dl className="stats">
          <Stat label="Total" value={stats.users.total} />
          <Stat label="Users" value={stats.users.users} />
          <Stat label="Trainers" value={stats.users.trainers} />
          <Stat label="Gym Managers" value={stats.users.gym_managers} />
          <Stat label="Admins" value={stats.users.admins} />
          <Stat label="Banned" value={stats.users.banned} alert />
          <Stat label="New in the last 7 days" value={stats.users.new_last_7_days} />
        </dl>
      </section>
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
  }, [load])

  const longDate = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })

  return (
    <div className="column">
      <div className="toolbar">
        <h2>
          Dashboard <span className="hint">· {longDate}</span>
        </h2>
        <button
          onClick={() => {
            void load()
            setRefreshKey((k) => k + 1)
          }}
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!overview && loading && <p className="empty">Loading the numbers…</p>}
      {overview && <FrontDesk overview={overview} />}
      {report && <GymReport {...report} />}
      <AnnouncementsCard
        refreshKey={refreshKey}
        emptyText="Nothing is showing to members right now."
        footer={
          <p className="hint">
            <a href="#/announcements">Open the announcements page</a> to post, edit or delete them.
          </p>
        }
      />
    </div>
  )
}
