import { useState } from "react"
import type { RevenueStats } from "../types/payment"
import { formatDate } from "../utils/member"
import { formatMoney, methodLabel } from "../utils/payment"
import BarList from "./BarList"

/** A round number at or just above the largest value, so the axis reads 0 / half / top in clean steps. */
function niceMax(value: number): number {
  if (value <= 0) return 0
  const power = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 4, 6, 8, 10].find((s) => s * power >= value) ?? 10
  return step * power
}

/** Axis ticks: in full under 10,000, compact (12K) once the axis reaches it. */
function tickLabel(value: number, top: number): string {
  if (top < 10_000) return value.toLocaleString("en-US")
  return `${Number((value / 1000).toFixed(1))}K`
}

const monthName = (month: string, style: "short" | "long") =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", {
    month: style,
    ...(style === "long" ? { year: "numeric" } : {}),
    timeZone: "UTC",
  })

// The last 6 months as columns. Each column shows its month and amount on hover or keyboard focus;
// the current month is labelled on its cap, and the table below holds every value.
function MonthChart({ months }: { months: RevenueStats["months"] }) {
  const [active, setActive] = useState<number | null>(null)
  const top = niceMax(Math.max(...months.map((m) => m.amount)))
  if (top === 0 && months.every((m) => m.expenses === 0)) return <p className="empty">No payments or expenses in the last 6 months.</p>

  const last = months.length - 1
  // The first and last tips line up with the plot's edge instead of centring, so they never overflow the card.
  const edge = (i: number) => (i === 0 ? "start" : i === last ? "end" : "")
  return (
    <>
      {top > 0 && (
        <div className="month-chart">
          <div className="month-axis" aria-hidden="true">
            {[top, top / 2, 0].map((t) => (
              <span key={t}>{tickLabel(t, top)}</span>
            ))}
          </div>
          <ul className="month-plot" aria-label="Revenue in each of the last 6 months">
            {months.map((m, i) => (
              <li
                key={m.month}
                tabIndex={0}
                aria-label={`${monthName(m.month, "long")}: ${formatMoney(m.amount)}`}
                className={active === i ? "month-col active" : "month-col"}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              >
                <div className="month-bar-area">
                  {m.amount > 0 && <div className="month-bar" style={{ height: `${(m.amount / top) * 100}%` }} />}
                  {/* The column's aria-label already says this, so screen readers skip the visual tip. */}
                  {active === i ? (
                    <div className={`chart-tip ${edge(i)}`} aria-hidden="true" style={{ bottom: `${(m.amount / top) * 100}%` }}>
                      <strong>{formatMoney(m.amount)}</strong>
                      <span>{monthName(m.month, "long")}</span>
                    </div>
                  ) : (
                    i === last && (
                      <span className="month-cap end" aria-hidden="true" style={{ bottom: `${(m.amount / top) * 100}%` }}>
                        {formatMoney(m.amount)}
                      </span>
                    )
                  )}
                </div>
                <span className="month-label">{monthName(m.month, "short")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <details className="chart-table">
        <summary>Show as a table, with expenses and net income</summary>
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>Revenue</th>
              <th>Expenses</th>
              <th>Net</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month}>
                <td>{monthName(m.month, "long")}</td>
                <td>{formatMoney(m.amount)}</td>
                <td>{formatMoney(m.expenses)}</td>
                <td>{formatMoney(m.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  )
}

// The last 30 days by method.
function MethodBars({ methods }: { methods: RevenueStats["by_method"] }) {
  if (methods.every((m) => m.amount === 0)) return <p className="empty">No payments in the last 30 days.</p>
  return (
    <BarList
      bars={methods.map((m) => ({
        key: m.method,
        name: methodLabel(m.method),
        note: `${m.count} payment${m.count === 1 ? "" : "s"}`,
        value: m.amount,
        label: formatMoney(m.amount),
      }))}
    />
  )
}

// Admins only: money taken and spent, from the same payments and expenses (and the same UTC days) as their pages.
export default function RevenueCard({ revenue }: { revenue: RevenueStats }) {
  return (
    <section className="card" aria-labelledby="stats-revenue">
      <h2 id="stats-revenue">Revenue and net income</h2>
      <dl className="stats">
        <div className="stat">
          <dt>Today</dt>
          <dd>{formatMoney(revenue.today)}</dd>
        </div>
        <div className="stat">
          <dt>This month</dt>
          <dd>{formatMoney(revenue.this_month)}</dd>
        </div>
        <div className="stat">
          <dt>Expenses this month</dt>
          <dd>
            <a href="#/expenses">{formatMoney(revenue.expenses_this_month)}</a>
          </dd>
        </div>
        <div className={revenue.net_this_month < 0 ? "stat alert" : "stat"}>
          <dt>Net this month</dt>
          <dd>{formatMoney(revenue.net_this_month)}</dd>
        </div>
        <div className="stat">
          <dt>Last 30 days</dt>
          <dd>{formatMoney(revenue.last_30_days)}</dd>
        </div>
      </dl>
      <div className="revenue-grid">
        <div className="stack">
          <h3>Last 30 days by method</h3>
          <MethodBars methods={revenue.by_method} />
        </div>
        <div className="stack">
          <h3>Revenue, last 6 months (৳)</h3>
          <MonthChart months={revenue.months} />
        </div>
      </div>
      <p className="hint">
        Whole taka by UTC day, voided payments left out. The last 30 days run from {formatDate(revenue.last_30_days_from)} to
        today. <a href="#/payments">Open the payments page</a>
      </p>
    </section>
  )
}
