import { useState } from "react"
import type { RevenueStats } from "../types/payment"
import { formatMoney, methodLabel, paymentsLink } from "../utils/payment"
import { count } from "../utils/text"
import { gymToday } from "../utils/time"
import BarList from "./BarList"
import Stat from "./Stat"

/** A round number at or just above the largest value, so the axis reads 0 / half / top in clean steps. */
function niceMax(value: number): number {
  if (value <= 0) return 0
  const power = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 4, 6, 8, 10].find((s) => s * power >= value) ?? 10
  return step * power
}

/** Axis ticks: in full under 10,000, compact (12K) once the axis reaches it. */
function tickLabel(value: number, top: number): string {
  if (top < 10_000 || value === 0) return value.toLocaleString("en-US")
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
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th className="number">Revenue</th>
                <th className="number">Expenses</th>
                <th className="number">Net</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month}>
                  <td className="name">{monthName(m.month, "long")}</td>
                  <td data-label="Revenue" className="number">
                    {formatMoney(m.amount)}
                  </td>
                  <td data-label="Expenses" className="number">
                    {formatMoney(m.expenses)}
                  </td>
                  <td data-label="Net" className="number">
                    {formatMoney(m.net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
        note: count(m.count, "payment"),
        value: m.amount,
        label: formatMoney(m.amount),
      }))}
    />
  )
}

// Admins only: money taken and spent, from the same payments and expenses as their pages. Voided payments never count.
export default function RevenueCard({ revenue: r }: { revenue: RevenueStats }) {
  const today = gymToday()
  return (
    <section className="card">
      <div className="toolbar">
        <h2>Revenue and net income</h2>
        <a href="#/payments">All payments</a>
      </div>
      <div className="stats">
        <Stat label="Today" value={formatMoney(r.today)} href={paymentsLink(today, today)} />
        <Stat label="Last 30 days" value={formatMoney(r.last_30_days)} href={paymentsLink(r.last_30_days_from, today)} />
        <Stat label="This month" value={formatMoney(r.this_month)} href={paymentsLink(`${today.slice(0, 7)}-01`, today)} />
        <Stat label="Expenses this month" value={formatMoney(r.expenses_this_month)} href="#/expenses" />
        <Stat label="Net this month" value={formatMoney(r.net_this_month)} />
      </div>
      <div className="split">
        <div className="stack">
          <h3>Last 30 days by method</h3>
          <MethodBars methods={r.by_method} />
        </div>
        <div className="stack">
          <h3>Last 6 months (taka)</h3>
          <MonthChart months={r.months} />
        </div>
      </div>
    </section>
  )
}
