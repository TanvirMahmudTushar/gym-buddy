import { type FormEvent, useEffect, useMemo, useState } from "react"
import { usePagedList } from "../hooks/usePagedList"
import { deleteGroups, exportGroupsCsv, listGroups } from "../services/moderationService"
import type { GroupFilters } from "../types/moderation"
import { errorText, formatDate, todayUtc } from "../utils/member"
import { saveFile } from "../utils/payment"
import ContentDeleteBar from "./ContentDeleteBar"

type Draft = Omit<GroupFilters, "owner_id">
const NO_FILTERS: Draft = { date_from: "", date_to: "", q: "" }

interface Props {
  ownerId: number | null
  onPickOwner: (id: number, label: string) => void
}

// Admins: every training group, with filters, select-many delete (with its workouts and memberships) and a CSV.
export default function ModerationGroups({ ownerId, onPickOwner }: Props) {
  const [draft, setDraft] = useState<Draft>(NO_FILTERS)
  const [applied, setApplied] = useState<Draft>(NO_FILTERS)
  const filters = useMemo<GroupFilters>(() => ({ ...applied, owner_id: ownerId }), [applied, ownerId])
  const [reloadKey, setReloadKey] = useState(0)
  const list = usePagedList(listGroups, filters, reloadKey)
  const [checkedIds, setCheckedIds] = useState<number[]>([])
  const [notice, setNotice] = useState("")
  const [filterError, setFilterError] = useState("")
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState("")

  useEffect(() => setCheckedIds([]), [filters, reloadKey])

  function apply(e: FormEvent) {
    e.preventDefault()
    if (draft.date_from && draft.date_to && draft.date_from > draft.date_to) {
      setFilterError("The From date must be on or before the To date.")
      return
    }
    setFilterError("")
    setNotice("")
    setApplied({ ...draft, q: draft.q.trim() })
  }

  async function exportCsv() {
    setExporting(true)
    setExportError("")
    try {
      saveFile(await exportGroupsCsv(filters), `groups-${todayUtc()}.csv`)
    } catch (err) {
      setExportError(errorText(err))
    } finally {
      setExporting(false)
    }
  }

  const allChecked = list.items.length > 0 && list.items.every((g) => checkedIds.includes(g.id))
  const toggle = (id: number) => setCheckedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  // How many workouts go with the ticked groups, for the confirm step.
  const workoutsTicked = list.items.filter((g) => checkedIds.includes(g.id)).reduce((sum, g) => sum + g.workout_count, 0)

  return (
    <section className="card" aria-labelledby="mod-groups-heading">
      <div className="toolbar">
        <h2 id="mod-groups-heading">All training groups</h2>
        <button onClick={exportCsv} disabled={exporting || list.loading || list.total === 0}>
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>
      <form className="filters" onSubmit={apply} noValidate aria-label="Filter groups">
        <div className="field">
          <label htmlFor="mod-g-q">Search</label>
          <input
            id="mod-g-q"
            value={draft.q}
            onChange={(e) => setDraft({ ...draft, q: e.target.value })}
            maxLength={100}
            placeholder="Group name, owner"
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label htmlFor="mod-g-from">Made from</label>
          <input id="mod-g-from" type="date" value={draft.date_from} onChange={(e) => setDraft({ ...draft, date_from: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="mod-g-to">Made to</label>
          <input id="mod-g-to" type="date" value={draft.date_to} onChange={(e) => setDraft({ ...draft, date_to: e.target.value })} />
        </div>
        <div className="actions">
          <button className="primary" type="submit" disabled={list.loading}>
            Apply
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(NO_FILTERS)
              setApplied(NO_FILTERS)
              setFilterError("")
            }}
            disabled={list.loading}
          >
            Clear
          </button>
        </div>
      </form>
      {filterError && (
        <p className="error" role="alert">
          {filterError}
        </p>
      )}
      <p className="summary" aria-live="polite">
        <strong>{list.total}</strong> group{list.total === 1 ? "" : "s"}
        <span className="hint"> · dates are UTC days</span>
      </p>
      {(list.error || exportError) && (
        <p className="error" role="alert">
          {list.error || exportError}
        </p>
      )}
      {notice && (
        <p className="hint" role="status">
          {notice}
        </p>
      )}
      {checkedIds.length > 0 && (
        <ContentDeleteBar
          ids={checkedIds}
          noun="group"
          warning={`Their ${workoutsTicked} workout${workoutsTicked === 1 ? "" : "s"} and every membership go with them.`}
          onDelete={async (ids) => (await deleteGroups(ids)).deleted}
          onDone={(message) => {
            setNotice(message)
            setReloadKey((k) => k + 1)
          }}
          onClear={() => setCheckedIds([])}
        />
      )}
      {list.loading && list.items.length === 0 ? (
        <p className="empty">Loading groups…</p>
      ) : list.items.length === 0 ? (
        <p className="empty">No groups match these filters.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="check">
                  <input
                    type="checkbox"
                    aria-label="Select all groups shown"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = checkedIds.length > 0 && !allChecked
                    }}
                    onChange={() => setCheckedIds(allChecked ? [] : list.items.map((g) => g.id))}
                  />
                </th>
                <th>Group</th>
                <th>Owner</th>
                <th>People</th>
                <th>Workouts</th>
                <th>Made</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((g) => (
                <tr key={g.id}>
                  <td className="check">
                    <input type="checkbox" aria-label={`Select ${g.name}`} checked={checkedIds.includes(g.id)} onChange={() => toggle(g.id)} />
                  </td>
                  <td className="name wrap">{g.name}</td>
                  <td className="wrap">
                    <button type="button" className="linklike" title="Show only this person's content" onClick={() => onPickOwner(g.owner_id, g.owner_name)}>
                      {g.owner_name}
                    </button>
                    <div className="hint">{g.owner_email}</div>
                  </td>
                  <td>{g.member_count}</td>
                  <td>{g.workout_count}</td>
                  <td>{formatDate(g.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
