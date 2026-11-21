import { useCallback, useEffect, useState } from "react"
import AnnouncementsCard from "../../components/AnnouncementsCard"
import Stat from "../../components/Stat"
import { getOverview } from "../../services/overviewService"
import type { Overview } from "../../types/overview"
import { formatClassTime } from "../../utils/gymClass"
import { errorText, todayUtc } from "../../utils/member"
import { formatMoney, paymentsLink } from "../../utils/payment"

// The Gym Manager's start page (Admins can open it too): what needs attention today. Every number links to the
// list it counts, and the list shows the same number.
export default function OverviewPage() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  // Refresh also reloads the announcements, which load on their own.
  const [refreshKey, setRefreshKey] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      setOverview(await getOverview())
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const today = todayUtc()
  const longDate = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })

  return (
    <div className="column">
      <div className="toolbar">
        <h2>
          Today <span className="hint">· {longDate}</span>
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
      {!overview && loading && <p className="empty">Loading today's numbers…</p>}
      {overview && (
        <>
          <section className="card" aria-labelledby="overview-desk">
            <h2 id="overview-desk">Front desk</h2>
            <dl className="stats">
              <Stat label="Checked in today" value={overview.check_ins_today} href="#/members" />
              <Stat label="Expiring in 7 days" value={overview.expiring_soon} href="#/members?filter=expiring_soon" />
              <Stat label="Waiting for a membership" value={overview.waiting} href="#/members?show=waiting" />
              <Stat
                label="Payments today"
                value={formatMoney(overview.payments_today.amount)}
                href={paymentsLink(today, today)}
                note={`${overview.payments_today.count} payment${overview.payments_today.count === 1 ? "" : "s"}, voided not counted`}
              />
            </dl>
            <p className="hint">"Today" starts at midnight UTC, the same day the Members and Payments pages use.</p>
          </section>
          <section className="card" aria-labelledby="overview-classes">
            <h2 id="overview-classes">Next classes</h2>
            {overview.next_classes.length === 0 ? (
              <p className="empty">No upcoming classes. Add one on the Classes page.</p>
            ) : (
              <ul className="visit-list">
                {overview.next_classes.map((c) => {
                  const full = c.booked_count >= c.capacity
                  return (
                    <li key={c.id}>
                      <span className="wrap-text">
                        <strong>{c.name}</strong>{" "}
                        <span className="hint">
                          · {formatClassTime(c.starts_at)} · {c.duration_minutes} min{c.trainer_name ? ` · ${c.trainer_name}` : ""}
                        </span>
                      </span>
                      <span className={full ? "pill expired" : "pill active"}>
                        {c.booked_count} / {c.capacity} booked
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
            <p className="hint">
              <a href="#/classes">Open the classes page</a> to see who booked, or to add and edit classes.
            </p>
          </section>
        </>
      )}
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
