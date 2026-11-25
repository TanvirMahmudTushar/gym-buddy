import type { CheckIn } from "../types/checkIn"
import { formatDate, formatTime, gymDay, gymToday } from "../utils/time"

// One visit in a list: the day, and from when to when.
export default function VisitRow({ visit: v, showRecorder = false }: { visit: CheckIn; showRecorder?: boolean }) {
  const inside = !v.checked_out_at && gymDay(v.checked_in_at) === gymToday()
  return (
    <li>
      <span>
        {formatDate(v.checked_in_at)}, {formatTime(v.checked_in_at)}
        {v.checked_out_at && ` to ${formatTime(v.checked_out_at)}`}
      </span>
      {inside ? <span className="pill good">In the gym</span> : showRecorder && v.recorded_by_name && <span className="hint">by {v.recorded_by_name}</span>}
    </li>
  )
}
