import type { ReactNode } from "react"

interface Props {
  label: string
  value: number | string
  /** Shows the number in red when it is above zero (such as banned users). */
  alert?: boolean
  /** Makes the tile a link to the list it counts. */
  href?: string
  /** A short line under the value, such as "3 payments". */
  note?: ReactNode
}

// One number on a dashboard. Used inside <div className="stats">.
export default function Stat({ label, value, alert = false, href, note }: Props) {
  const className = alert && typeof value === "number" && value > 0 ? "stat alert-value" : "stat"
  const content = (
    <>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {note && <span className="hint">{note}</span>}
    </>
  )
  return href ? (
    <a className={className} href={href}>
      {content}
    </a>
  ) : (
    <div className={className}>{content}</div>
  )
}
