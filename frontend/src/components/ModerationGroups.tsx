import { type ReactNode, useState } from "react"
import { useDebouncedValue } from "../hooks/useDebouncedValue"
import { usePagedList } from "../hooks/usePagedList"
import { useSelection } from "../hooks/useSelection"
import { deleteGroups, exportGroupsCsv, listGroups } from "../services/moderationService"
import type { GroupFilters, ModerationGroup } from "../types/moderation"
import { usersLink } from "../utils/auth"
import { count } from "../utils/text"
import { formatDate } from "../utils/time"
import { trainingLink } from "../utils/workout"
import Alert from "./Alert"
import BulkDelete from "./BulkDelete"
import ConfirmModal from "./ConfirmModal"
import ExportButton from "./ExportButton"
import ListState from "./ListState"
import PageHeader from "./PageHeader"
import Pager from "./Pager"
import TickAll from "./TickAll"

const NO_FILTERS: GroupFilters = { owner_id: null, date_from: "", date_to: "", q: "" }

interface Props {
  tabs: ReactNode
  /** Only this account's groups (from a user's details). */
  ownerId: number | null
}

// Admins: every training group, with filters, delete one or many (with their workouts and memberships) and a CSV.
export default function ModerationGroups({ tabs, ownerId }: Props) {
  const [draft, setDraft] = useState<GroupFilters>({ ...NO_FILTERS, owner_id: ownerId })
  const filters = useDebouncedValue(draft)
  const [reloadKey, setReloadKey] = useState(0)
  const list = usePagedList(listGroups, filters, reloadKey)
  const selection = useSelection(list.items.map((g) => g.id))
  const [deleting, setDeleting] = useState<ModerationGroup | null>(null)
  const [notice, setNotice] = useState("")
  const [exportError, setExportError] = useState("")
  // How many workouts go with the ticked groups, for the question.
  const workoutsTicked = list.items.filter((g) => selection.has(g.id)).reduce((sum, g) => sum + g.workout_count, 0)

  async function remove(ids: number[]) {
    const { deleted } = await deleteGroups(ids)
    setNotice(`Deleted ${count(deleted, "group")}. It is recorded in the activity log.`)
    setReloadKey((k) => k + 1)
  }

  return (
    <>
      <PageHeader title="Training" subtitle="Moderation: every training group in the gym, whoever runs it.">
        <ExportButton name="groups" load={() => exportGroupsCsv(filters)} total={list.total} onError={setExportError} />
      </PageHeader>
      {tabs}
      <section className="card">
        <div className="filters">
          <div className="field grow">
            <label htmlFor="mod-g-q">Search</label>
            <input id="mod-g-q" type="search" value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} maxLength={100} placeholder="Group or owner" autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="mod-g-from">Started from</label>
            <input id="mod-g-from" type="date" max={draft.date_to || undefined} value={draft.date_from} onChange={(e) => setDraft({ ...draft, date_from: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="mod-g-to">Started to</label>
            <input id="mod-g-to" type="date" min={draft.date_from || undefined} value={draft.date_to} onChange={(e) => setDraft({ ...draft, date_to: e.target.value })} />
          </div>
          <button type="button" onClick={() => setDraft(NO_FILTERS)}>
            Clear
          </button>
        </div>
        {filters.owner_id && <Alert kind="info">Only groups owned by account #{filters.owner_id}. Clear the filters to see everyone's.</Alert>}
        <Alert kind="success">{notice}</Alert>
        <Alert>{exportError}</Alert>
        <BulkDelete selection={selection} noun="group" warning={`${count(workoutsTicked, "workout")} and every membership go with them.`} onDelete={remove} />
        <ListState loading={list.loading} error={list.error} isEmpty={list.items.length === 0} empty="No groups match these filters.">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <TickAll selection={selection} label="Select all groups shown" />
                  <th>Group</th>
                  <th>Owner</th>
                  <th className="number">People</th>
                  <th className="number">Workouts</th>
                  <th>Started</th>
                  <th className="act">
                    <span className="visually-hidden">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((g) => (
                  <tr key={g.id}>
                    <td className="tick" data-label="Select">
                      <input type="checkbox" aria-label={`Select ${g.name}`} checked={selection.has(g.id)} onChange={() => selection.toggle(g.id)} />
                    </td>
                    <td className="name">{g.name}</td>
                    <td data-label="Owner">
                      <span>
                        <a href={usersLink(g.owner_id)}>{g.owner_name}</a>
                        <span className="hint">{g.owner_email}</span>
                      </span>
                    </td>
                    <td data-label="People" className="number">
                      {g.member_count}
                    </td>
                    <td data-label="Workouts" className="number">
                      <a href={trainingLink("all-workouts", { group_id: g.id })}>{g.workout_count}</a>
                    </td>
                    <td data-label="Started" className="nowrap">
                      {formatDate(g.created_at)}
                    </td>
                    <td className="act">
                      <div className="actions">
                        <button type="button" className="small danger" onClick={() => setDeleting(g)}>
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
          title={`Delete "${deleting.name}"?`}
          confirmLabel="Delete group"
          busyLabel="Deleting…"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await remove([deleting.id])
            setDeleting(null)
          }}
        >
          Its {count(deleting.workout_count, "workout")} and every membership go with it. This cannot be undone.
        </ConfirmModal>
      )}
    </>
  )
}
