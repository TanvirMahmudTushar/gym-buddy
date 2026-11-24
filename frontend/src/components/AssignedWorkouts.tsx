import { useState } from "react"
import { useAuth } from "../context/AuthContext"
import { usePagedList } from "../hooks/usePagedList"
import { listAssignedToMe } from "../services/workoutService"
import type { Workout } from "../types/workout"
import WorkoutItem from "./WorkoutItem"

const load = (_filters: null, offset: number) => listAssignedToMe(offset)

// The workouts assigned to me, from every group I am in. I mark each one done here.
export default function AssignedWorkouts() {
  const { user } = useAuth()
  const list = usePagedList(load, null)
  // Workouts marked since the list was loaded, so a mark shows without loading the list again.
  const [changed, setChanged] = useState<Record<number, Workout>>({})

  return (
    <section className="card" aria-labelledby="assigned-heading">
      <h2 id="assigned-heading">Assigned to me {list.total > 0 && <span className="hint">({list.total})</span>}</h2>
      <p className="hint">The workouts your trainer gave you, latest first. Mark each one when you have done it.</p>
      {list.error && (
        <p className="error" role="alert">
          {list.error}
        </p>
      )}
      {list.loading && list.items.length === 0 ? (
        <p className="empty">Loading your workouts…</p>
      ) : list.items.length === 0 ? (
        !list.error && <p className="empty">No workouts are assigned to you yet.</p>
      ) : (
        <ul className="class-list">
          {list.items.map((w) => (
            <WorkoutItem
              key={w.id}
              workout={changed[w.id] ?? w}
              meId={user?.id ?? 0}
              canEdit={false}
              showGroup
              onChanged={(updated) => setChanged((prev) => ({ ...prev, [updated.id]: updated }))}
              onDeleted={() => undefined}
            />
          ))}
        </ul>
      )}
      {list.items.length > 0 && (
        <div className="list-foot">
          <span>
            Showing {list.items.length} of {list.total}
          </span>
          {list.items.length < list.total && (
            <button onClick={list.loadMore} disabled={list.loadingMore}>
              {list.loadingMore ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
