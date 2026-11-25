import type { ReactNode } from "react"
import { useAuth } from "../context/AuthContext"
import { usePagedList } from "../hooks/usePagedList"
import { listAssignedToMe } from "../services/workoutService"
import ListState from "./ListState"
import PageHeader from "./PageHeader"
import Pager from "./Pager"
import WorkoutItem from "./WorkoutItem"

const load = (_filters: null, offset: number) => listAssignedToMe(offset)

// The workouts assigned to me, from every group I am in. I mark each one done here.
export default function AssignedWorkouts({ tabs }: { tabs: ReactNode }) {
  const { user } = useAuth()
  const list = usePagedList(load, null)

  return (
    <>
      <PageHeader title="Training" subtitle="The workouts your trainer gave you, latest first. Mark each one when you have done it." />
      {tabs}
      <ListState loading={list.loading} error={list.error} isEmpty={list.items.length === 0} empty="No workouts are assigned to you yet.">
        <ul className="card-grid">
          {list.items.map((w) => (
            <WorkoutItem
              key={w.id}
              workout={w}
              meId={user?.id ?? 0}
              showGroup
              onChanged={(updated) => list.replace((items) => items.map((x) => (x.id === updated.id ? updated : x)))}
            />
          ))}
        </ul>
        <Pager {...list} onChange={list.goTo} />
      </ListState>
    </>
  )
}
