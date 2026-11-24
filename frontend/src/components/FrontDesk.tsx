import type { Overview } from "../types/overview"
import { equipmentLink } from "../utils/equipment"
import { formatClassTime } from "../utils/gymClass"
import { todayUtc } from "../utils/member"
import { formatMoney, paymentsLink } from "../utils/payment"
import Stat from "./Stat"

// The front desk part of the Dashboard: what needs attention today. Every number links to the list it counts, and the
// list shows the same number.
export default function FrontDesk({ overview }: { overview: Overview }) {
  const today = todayUtc()
  const payments = overview.payments_today
  return (
    <>
      <section className="card" aria-labelledby="desk-heading">
        <h2 id="desk-heading">Today</h2>
        <dl className="stats">
          <Stat label="In the gym now" value={overview.inside_now} href="#/attendance?inside=1" />
          <Stat label="Checked in today" value={overview.check_ins_today} href="#/attendance" />
          <Stat
            label="Payments today"
            value={formatMoney(payments.amount)}
            href={paymentsLink(today, today)}
            note={`${payments.count} payment${payments.count === 1 ? "" : "s"}, voided not counted`}
          />
          <Stat label="Expiring in 7 days" value={overview.expiring_soon} href="#/members?filter=expiring_soon" />
          <Stat label="Waiting for a membership" value={overview.waiting} href="#/members?show=waiting" />
          <Stat label="Equipment to fix" value={overview.equipment_attention} alert href={equipmentLink("needs_attention")} />
          <Stat label="Services due" value={overview.equipment_service_due} href={equipmentLink("service_due")} />
        </dl>
        <p className="hint">"Today" starts at midnight UTC, the same day every list uses.</p>
      </section>
      <section className="card" aria-labelledby="next-classes-heading">
        <div className="toolbar">
          <h2 id="next-classes-heading">Next classes</h2>
          <a href="#/classes">All classes</a>
        </div>
        {overview.next_classes.length === 0 ? (
          <p className="empty">No upcoming classes. Add one on the Classes page.</p>
        ) : (
          <ul className="visit-list">
            {overview.next_classes.map((c) => (
              <li key={c.id}>
                <span className="wrap-text">
                  <strong>{c.name}</strong>{" "}
                  <span className="hint">
                    · {formatClassTime(c.starts_at)} · {c.duration_minutes} min{c.trainer_name ? ` · ${c.trainer_name}` : ""}
                  </span>
                </span>
                <span className={c.booked_count >= c.capacity ? "pill expired" : "pill active"}>
                  {c.booked_count} / {c.capacity} booked
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
