import { useEffect, useState } from "react"
import AssignedWorkouts from "../../components/AssignedWorkouts"
import GroupDetail from "../../components/GroupDetail"
import GroupList from "../../components/GroupList"
import ModerationGroups from "../../components/ModerationGroups"
import ModerationWorkouts from "../../components/ModerationWorkouts"
import { useAuth } from "../../context/AuthContext"
import type { Me } from "../../types/auth"
import { can, usersLink } from "../../utils/auth"
import { hashParams } from "../../utils/member"
import { type TrainingTab, trainingLink } from "../../utils/workout"

const TABS: { tab: TrainingTab; label: string; needs: (user: Me) => boolean }[] = [
  { tab: "assigned", label: "Assigned to me", needs: () => true },
  { tab: "groups", label: "My groups", needs: () => true },
  // Content moderation: every group and workout in the gym, also the ones the admin is not in.
  { tab: "all-groups", label: "All groups", needs: (u) => can(u, "content:moderate") },
  { tab: "all-workouts", label: "All workouts", needs: (u) => can(u, "content:moderate") },
]

function asId(value: string | null): number | null {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

/** What the address names: a group (#/training?group=5), or a tab, with the owner the admin's lists are limited to. */
function readHash(user: Me | null) {
  const params = hashParams()
  const allowed = TABS.filter((t) => user !== null && t.needs(user))
  // Members come to see their workouts; everyone else comes to run groups.
  const home: TrainingTab = user?.role === "user" ? "assigned" : "groups"
  return {
    group: asId(params.get("group")),
    tab: allowed.find((t) => t.tab === params.get("tab"))?.tab ?? home,
    owner: asId(params.get("owner")),
  }
}

// Training: the workouts assigned to me, the groups I run or train in, and for admins every group and workout.
export default function TrainingPage() {
  const { user } = useAuth()
  const [view, setView] = useState(() => readHash(user))
  // The owner's name, once known from a clicked row; a link from a user's details gives only the id.
  const [ownerLabel, setOwnerLabel] = useState<string | null>(null)

  // Links inside the page change only the part after ?, so the page follows the address itself.
  useEffect(() => {
    const onChange = () => setView(readHash(user))
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [user])

  if (view.group !== null) return <GroupDetail key={view.group} groupId={view.group} />

  const { tab, owner } = view
  const moderating = tab === "all-groups" || tab === "all-workouts"
  const pickOwner = (id: number, label: string) => {
    setOwnerLabel(label)
    window.location.hash = trainingLink(tab, id)
  }

  return (
    <div className="column">
      <div className="toolbar">
        <h2>Training</h2>
        <div className="chips" role="group" aria-label="What to show">
          {TABS.filter((t) => user !== null && t.needs(user)).map((t) => (
            <a key={t.tab} className="chip" href={trainingLink(t.tab)} aria-current={tab === t.tab ? "true" : undefined}>
              {t.label}
            </a>
          ))}
        </div>
      </div>
      {moderating && (
        <p className="hint">
          Every training group and workout in the gym, whoever runs it. You can remove them, not edit them; a removal
          cannot be undone and is recorded in the activity log, like every CSV download.
        </p>
      )}
      {moderating && owner && (
        <p className="hint">
          Only what <a href={usersLink(owner)}>{ownerLabel ?? `account #${owner}`}</a> added. <a href={trainingLink(tab)}>Show everyone's</a>
        </p>
      )}
      {tab === "assigned" && <AssignedWorkouts />}
      {tab === "groups" && <GroupList />}
      {tab === "all-groups" && <ModerationGroups ownerId={owner} onPickOwner={pickOwner} />}
      {tab === "all-workouts" && <ModerationWorkouts ownerId={owner} onPickOwner={pickOwner} />}
    </div>
  )
}
