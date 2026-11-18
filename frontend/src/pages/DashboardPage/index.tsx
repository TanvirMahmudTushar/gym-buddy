import { useCallback, useEffect, useState } from "react"
import { getStats } from "../../services/adminService"
import type { AdminStats } from "../../types/auth"
import { errorText } from "../../utils/member"

function Stat({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className={alert && value > 0 ? "stat alert" : "stat"}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

// Admins only: how the gym and the app are being used.
export default function DashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      setStats(await getStats())
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="column">
      <div className="toolbar">
        <h2>Dashboard</h2>
        <button onClick={load} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!stats && loading && <p className="empty">Loading the numbers…</p>}
      {stats && (
        <>
          <section className="card" aria-labelledby="stats-members">
            <h2 id="stats-members">Members</h2>
            <dl className="stats">
              <Stat label="Total" value={stats.members.total} />
              <Stat label="Active" value={stats.members.active} />
              <Stat label="Expired" value={stats.members.expired} />
              <Stat label="Frozen" value={stats.members.frozen} />
              <Stat label="New in the last 7 days" value={stats.members.new_last_7_days} />
            </dl>
            <p className="hint">
              <a href="#/members">Open the members page</a>
            </p>
          </section>
          <section className="card" aria-labelledby="stats-checkins">
            <h2 id="stats-checkins">Check-ins</h2>
            <dl className="stats">
              <Stat label="Today" value={stats.check_ins.today} />
              <Stat label="Last 7 days" value={stats.check_ins.last_7_days} />
            </dl>
          </section>
          <section className="card" aria-labelledby="stats-classes">
            <h2 id="stats-classes">Classes</h2>
            <dl className="stats">
              <Stat label="Total" value={stats.classes.total} />
              <Stat label="Upcoming" value={stats.classes.upcoming} />
            </dl>
            <p className="hint">
              <a href="#/classes">Open the classes page</a>
            </p>
          </section>
          <section className="card" aria-labelledby="stats-users">
            <h2 id="stats-users">Accounts</h2>
            <dl className="stats">
              <Stat label="Total" value={stats.users.total} />
              <Stat label="Users" value={stats.users.users} />
              <Stat label="Gym Managers" value={stats.users.gym_managers} />
              <Stat label="Admins" value={stats.users.admins} />
              <Stat label="Banned" value={stats.users.banned} alert />
            </dl>
            <p className="hint">
              <a href="#/users">Manage users and roles</a>
            </p>
          </section>
        </>
      )}
    </div>
  )
}
