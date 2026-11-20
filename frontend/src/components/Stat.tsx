import type { ReactNode } from "react"

interface Props {
  label: string
  value: number | string
  /** Shows the number in red when it is above zero (such as banned users). */
  alert?: boolean
  /** Makes the value a link to the list it counts. */
  href?: string
  /** A short line under the value, such as "3 payments". */
  note?: ReactNode
}

// One number on a dashboard. Used inside <dl className="stats">.
export default function Stat({ label, value, alert = false, href, note }: Props) {
  const warn = alert && typeof value === "number" && value > 0
  return (
    <div className={warn ? "stat alert" : "stat"}>
      <dt>{label}</dt>
      <dd>{href ? <a href={href}>{value}</a> : value}</dd>
      {note && <span className="hint">{note}</span>}
    </div>
  )
}
