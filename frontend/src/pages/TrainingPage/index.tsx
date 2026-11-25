import AssignedWorkouts from "../../components/AssignedWorkouts"
import GroupDetail from "../../components/GroupDetail"
import GroupList from "../../components/GroupList"
import ModerationGroups from "../../components/ModerationGroups"
import ModerationWorkouts from "../../components/ModerationWorkouts"
import { useAuth } from "../../context/AuthContext"
import { useHashValue } from "../../hooks/useHashValue"
import type { Me } from "../../types/auth"
import { can } from "../../utils/auth"
import { hashId, hashParams } from "../../utils/hash"
import { type TrainingTab, trainingLink } from "../../utils/workout"

const TABS: { tab: TrainingTab; label: string; needs: (user: Me) => boolean }[] = [
  { tab: "assigned", label: "Assigned to me", needs: () => true },
  { tab: "groups", label: "My groups", needs: () => true },
  // Content moderation: every group and workout in the gym, also the ones the admin is not in.
  { tab: "all-groups", label: "All groups", needs: (u) => can(u, "content:moderate") },
  { tab: "all-workouts", label: "All workouts", needs: (u) => can(u, "content:moderate") },
]

// Training: the workouts assigned to me, the groups I run or train in, and for admins every group and workout.
export default function TrainingPage() {
  const { user } = useAuth()
  // What the address names: a group (#/training?group=5), or a tab (#/training?tab=groups), with the owner or group the
  // admin's lists are limited to.
  const view = useHashValue(() => ({
    group: hashId("group"),
    tab: hashParams().get("tab"),
    owner: hashId("owner"),
    inGroup: hashId("group_id"),
  }))
  if (!user) return null
  if (view.group !== null) return <GroupDetail key={view.group} groupId={view.group} />

  const allowed = TABS.filter((t) => t.needs(user))
  // Members come to see their workouts; everyone else comes to run groups.
  const home: TrainingTab = user.role === "user" ? "assigned" : "groups"
  const tab = allowed.find((t) => t.tab === view.tab)?.tab ?? home

  const chips = (
    <div className="chips" role="group" aria-label="What to show">
      {allowed.map((t) => (
        <a key={t.tab} className="chip" href={trainingLink(t.tab)} aria-current={tab === t.tab ? "true" : undefined}>
          {t.label}
        </a>
      ))}
    </div>
  )

  return (
    <div className="page">
      {tab === "assigned" && <AssignedWorkouts tabs={chips} />}
      {tab === "groups" && <GroupList tabs={chips} />}
      {tab === "all-groups" && <ModerationGroups key={view.owner} tabs={chips} ownerId={view.owner} />}
      {tab === "all-workouts" && <ModerationWorkouts key={`${view.owner}-${view.inGroup}`} tabs={chips} ownerId={view.owner} groupId={view.inGroup} />}
    </div>
  )
}
