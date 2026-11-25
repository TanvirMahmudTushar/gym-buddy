import type { ReactNode } from "react"
import type { BookedClass } from "../types/gymClass"
import { formatClassTime } from "../utils/time"

// One booking in a list: the class, when it is, and whether the member came.
export default function BookingRow({ booking: b, children }: { booking: BookedClass; children?: ReactNode }) {
  return (
    <li>
      <span>
        <span className="row-title">{b.class_name}</span>
        <span className="hint">
          {formatClassTime(b.starts_at)} · {b.duration_minutes} min{b.trainer_name ? ` · ${b.trainer_name}` : ""}
        </span>
      </span>
      {b.attended !== null ? <span className={b.attended ? "pill good" : "pill bad"}>{b.attended ? "Attended" : "Missed"}</span> : children || <span />}
    </li>
  )
}
