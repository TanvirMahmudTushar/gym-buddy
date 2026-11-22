import { useCallback, useEffect, useState } from "react"
import WorkoutForm, { type WorkoutFormValues } from "../../components/WorkoutForm"
import WorkoutItem from "../../components/WorkoutItem"
import { createWorkout, listAssignedToMe, listMyWorkouts } from "../../services/workoutService"
import type { Workout, WorkoutPage } from "../../types/workout"
import { errorText } from "../../utils/member"

/** One paged list of workouts: the items, the total, and loading state. */
function useWorkoutList(load: (offset: number) => Promise<WorkoutPage>) {
  const [items, setItems] = useState<Workout[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState("")

  const reload = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const page = await load(0)
      setItems(page.items)
      setTotal(page.total)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoading(false)
    }
  }, [load])

  useEffect(() => {
    void reload()
  }, [reload])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const page = await load(items.length)
      setItems((prev) => [...prev, ...page.items])
      setTotal(page.total)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoadingMore(false)
    }
  }

  const replace = (updated: Workout) => setItems((prev) => prev.map((w) => (w.id === updated.id ? updated : w)))
  const drop = (id: number) => {
    setItems((prev) => prev.filter((w) => w.id !== id))
    setTotal((n) => n - 1)
  }
  return { items, total, loading, loadingMore, error, reload, loadMore, replace, drop }
}

function Foot({ shown, total, loadingMore, onMore }: { shown: number; total: number; loadingMore: boolean; onMore: () => void }) {
  if (shown === 0) return null
  return (
    <div className="list-foot">
      <span>
        Showing {shown} of {total}
      </span>
      {shown < total && (
        <button onClick={onMore} disabled={loadingMore}>
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  )
}

// Everyone: log my own workouts (only I can see them) and see the group workouts assigned to me.
export default function WorkoutsPage() {
  const mine = useWorkoutList(listMyWorkouts)
  const assigned = useWorkoutList(listAssignedToMe)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  // Changing this remounts the add form, which clears it after a workout is added.
  const [formKey, setFormKey] = useState(0)

  async function add(values: WorkoutFormValues) {
    setSaving(true)
    setSaveError("")
    try {
      await createWorkout({ title: values.title, workout_date: values.workout_date, notes: values.notes })
      setFormKey((k) => k + 1)
      // Reload so the new workout lands in date order.
      await mine.reload()
    } catch (err) {
      setSaveError(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="column">
      <section className="card" aria-labelledby="workouts-heading">
        <h2 id="workouts-heading">My workouts</h2>
        <p className="hint">Only you can see these. To share workouts with others, add them in a group on the Groups page.</p>
        <WorkoutForm key={formKey} saving={saving} error={saveError} onSave={add} />
        {mine.error && (
          <p className="error" role="alert">
            {mine.error}
          </p>
        )}
        {mine.loading && mine.items.length === 0 ? (
          <p className="empty">Loading your workouts…</p>
        ) : mine.items.length === 0 ? (
          <p className="empty">No workouts yet. Add your first one above.</p>
        ) : (
          <ul className="class-list">
            {mine.items.map((w) => (
              <WorkoutItem key={w.id} workout={w} canEdit onChanged={mine.replace} onDeleted={mine.drop} />
            ))}
          </ul>
        )}
        <Foot shown={mine.items.length} total={mine.total} loadingMore={mine.loadingMore} onMore={mine.loadMore} />
      </section>

      <section className="card" aria-labelledby="assigned-heading">
        <h2 id="assigned-heading">Assigned to me</h2>
        <p className="hint">Group workouts someone assigned to you. Open the group to change one, if your permissions there allow it.</p>
        {assigned.error && (
          <p className="error" role="alert">
            {assigned.error}
          </p>
        )}
        {assigned.loading && assigned.items.length === 0 ? (
          <p className="empty">Loading…</p>
        ) : assigned.items.length === 0 ? (
          <p className="empty">Nothing is assigned to you.</p>
        ) : (
          <ul className="class-list">
            {assigned.items.map((w) => (
              <WorkoutItem key={w.id} workout={w} canEdit={false} showGroup onChanged={assigned.replace} onDeleted={assigned.drop} />
            ))}
          </ul>
        )}
        <Foot shown={assigned.items.length} total={assigned.total} loadingMore={assigned.loadingMore} onMore={assigned.loadMore} />
      </section>
    </div>
  )
}
