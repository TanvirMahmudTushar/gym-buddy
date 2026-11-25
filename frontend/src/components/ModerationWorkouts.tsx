import { type ReactNode, useState } from "react"
import { useDebouncedValue } from "../hooks/useDebouncedValue"
import { usePagedList } from "../hooks/usePagedList"
import { useSelection } from "../hooks/useSelection"
import { deleteWorkouts, exportWorkoutsCsv, listWorkouts } from "../services/moderationService"
import type { ModerationWorkout, WorkoutFilters } from "../types/moderation"
import type { WorkoutStatus } from "../types/workout"
import { usersLink } from "../utils/auth"
import { count } from "../utils/text"
import { formatDate } from "../utils/time"
import { WORKOUT_STATUSES } from "../utils/workout"
import Alert from "./Alert"
import BulkDelete from "./BulkDelete"
import ConfirmModal from "./ConfirmModal"
import ExportButton from "./ExportButton"
import ListState from "./ListState"
import PageHeader from "./PageHeader"
import Pager from "./Pager"
import TickAll from "./TickAll"

const NO_FILTERS: WorkoutFilters = { owner_id: null, group_id: null, status: "", date_from: "", date_to: "", q: "" }

interface Props {
  tabs: ReactNode
  /** Only this account's workouts (from a user's details). */
  ownerId: number | null
  /** Only this group's workouts (from All groups). */
  groupId: number | null
}

// Admins: every workout in every group, with filters, delete one or many, and a CSV of the same rows.
export default function ModerationWorkouts({ tabs, ownerId, groupId }: Props) {
  const [draft, setDraft] = useState<WorkoutFilters>({ ...NO_FILTERS, owner_id: ownerId, group_id: groupId })
  const filters = useDebouncedValue(draft)
  const [reloadKey, setReloadKey] = useState(0)
  const list = usePagedList(listWorkouts, filters, reloadKey)
  const selection = useSelection(list.items.map((w) => w.id))
  const [deleting, setDeleting] = useState<ModerationWorkout | null>(null)
  const [notice, setNotice] = useState("")
  const [exportError, setExportError] = useState("")

  async function remove(ids: number[]) {
    const { deleted } = await deleteWorkouts(ids)
    setNotice(`Deleted ${count(deleted, "workout")}. It is recorded in the activity log.`)
    setReloadKey((k) => k + 1)
  }

  return (
    <>
      <PageHeader title="Training" subtitle="Moderation: every workout in every training group.">
        <ExportButton name="workouts" load={() => exportWorkoutsCsv(filters)} disabled={list.total === 0} onError={setExportError} />
      </PageHeader>
      {tabs}
      <section className="card">
        <div className="filters">
          <div className="field grow">
            <label htmlFor="mod-w-q">Search</label>
            <input id="mod-w-q" type="search" value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} maxLength={100} placeholder="Title, notes or owner" autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="mod-w-status">Status</label>
            <select id="mod-w-status" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as WorkoutStatus | "" })}>
              <option value="">Any</option>
              {WORKOUT_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="mod-w-from">From</label>
            <input id="mod-w-from" type="date" max={draft.date_to || undefined} value={draft.date_from} onChange={(e) => setDraft({ ...draft, date_from: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="mod-w-to">To</label>
            <input id="mod-w-to" type="date" min={draft.date_from || undefined} value={draft.date_to} onChange={(e) => setDraft({ ...draft, date_to: e.target.value })} />
          </div>
          <button type="button" onClick={() => setDraft(NO_FILTERS)}>
            Clear
          </button>
        </div>
        {filters.owner_id && <Alert kind="info">Only workouts added by account #{filters.owner_id}. Clear the filters to see everyone's.</Alert>}
        {filters.group_id && <Alert kind="info">Only the workouts of one group. Clear the filters to see every group's.</Alert>}
        <Alert kind="success">{notice}</Alert>
        <Alert>{exportError}</Alert>
        <BulkDelete selection={selection} noun="workout" warning="They disappear from their groups." onDelete={remove} />
        <ListState loading={list.loading} error={list.error} isEmpty={list.items.length === 0} empty="No workouts match these filters.">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <TickAll selection={selection} label="Select all workouts shown" />
                  <th>Workout</th>
                  <th>Date</th>
                  <th>Group</th>
                  <th>Owner</th>
                  <th>Assigned to</th>
                  <th className="act">
                    <span className="visually-hidden">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((w) => (
                  <tr key={w.id}>
                    <td className="tick" data-label="Select">
                      <input type="checkbox" aria-label={`Select ${w.title}`} checked={selection.has(w.id)} onChange={() => selection.toggle(w.id)} />
                    </td>
                    <td className="name">
                      {w.title}
                      {w.notes && <span className="hint">{w.notes.length > 90 ? `${w.notes.slice(0, 90)}…` : w.notes}</span>}
                    </td>
                    <td data-label="Date" className="nowrap">
                      {formatDate(w.workout_date)}
                    </td>
                    <td data-label="Group">{w.group_name ?? "—"}</td>
                    <td data-label="Owner">
                      {w.owner_id !== null ? (
                        <span>
                          <a href={usersLink(w.owner_id)}>{w.owner_name}</a>
                          <span className="hint">{w.owner_email}</span>
                        </span>
                      ) : (
                        "Deleted account"
                      )}
                    </td>
                    <td data-label="Assigned to">
                      <span>
                        {w.assigned_to_name ?? "—"} {w.completed_at && <span className="pill good">Done</span>}
                      </span>
                    </td>
                    <td className="act">
                      <div className="actions">
                        <button type="button" className="small danger" onClick={() => setDeleting(w)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager {...list} onChange={list.goTo} />
        </ListState>
      </section>
      {deleting && (
        <ConfirmModal
          title={`Delete "${deleting.title}"?`}
          confirmLabel="Delete workout"
          busyLabel="Deleting…"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await remove([deleting.id])
            setDeleting(null)
          }}
        >
          It disappears from {deleting.group_name ? `the group "${deleting.group_name}"` : "the app"}. This cannot be undone.
        </ConfirmModal>
      )}
    </>
  )
}
