import type { GymClass } from "../types/gymClass"
import { formatClassTime, isUpcoming } from "../utils/time"
import Icon from "./Icon"

// The top of every class card: what, when, who teaches it and how full it is.
export default function ClassSummary({ gymClass: c, showTrainer = true }: { gymClass: GymClass; showTrainer?: boolean }) {
  return (
    <>
      <div className="item-head">
        <h2>{c.name}</h2>
        <span className={c.booked_count >= c.capacity ? "pill bad" : "pill good"}>
          {c.booked_count} / {c.capacity}
        </span>
      </div>
      <div className="meta">
        <span>
          <Icon name="classes" /> {formatClassTime(c.starts_at)}, {c.duration_minutes} min
        </span>
        {showTrainer && (
          <span>
            <Icon name="users" /> {c.trainer_name ?? "No trainer"}
          </span>
        )}
        {!isUpcoming(c.starts_at) && <span>Started</span>}
      </div>
      {c.description && <p className="wrap-text">{c.description}</p>}
    </>
  )
}
