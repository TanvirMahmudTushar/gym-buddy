import { type FormEvent, useEffect, useMemo, useState } from "react"
import { usePagedList } from "../hooks/usePagedList"
import { deleteWorkouts, exportWorkoutsCsv, listWorkouts } from "../services/moderationService"
import type { WorkoutFilters } from "../types/moderation"
import { errorText, formatDate, todayUtc } from "../utils/member"
import { saveFile } from "../utils/payment"
import ContentDeleteBar from "./ContentDeleteBar"

type Draft = Omit<WorkoutFilters, "owner_id">
const NO_FILTERS: Draft = { kind: "", date_from: "", date_to: "", q: "" }

interface Props {
  /** Only this account's workouts (set from a user's details, or by clicking an owner). */
  ownerId: number | null
  onPickOwner: (id: number, label: string) => void
}

// Admins: every workout, personal or in a group, with filters, select-many delete and a CSV of the same rows.
export default function ModerationWorkouts({ ownerId, onPickOwner }: Props) {
  const [draft, setDraft] = useState<Draft>(NO_FILTERS)
  const [applied, setApplied] = useState<Draft>(NO_FILTERS)
  const filters = useMemo<WorkoutFilters>(() => ({ ...applied, owner_id: ownerId }), [applied, ownerId])
  const [reloadKey, setReloadKey] = useState(0)
  const list = usePagedList(listWorkouts, filters, reloadKey)
  const [checkedIds, setCheckedIds] = useState<number[]>([])
  const [notice, setNotice] = useState("")
  const [filterError, setFilterError] = useState("")
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState("")

  // Ticks belong to the rows on screen, so they are cleared whenever the list loads again.
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
      saveFile(await exportWorkoutsCsv(filters), `workouts-${todayUtc()}.csv`)
    } catch (err) {
      setExportError(errorText(err))
    } finally {
      setExporting(false)
    }
  }

  const allChecked = list.items.length > 0 && list.items.every((w) => checkedIds.includes(w.id))
  const toggle = (id: number) => setCheckedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  return (
    <section className="card" aria-labelledby="mod-workouts-heading">
      <div className="toolbar">
        <h2 id="mod-workouts-heading">Workouts</h2>
        <button onClick={exportCsv} disabled={exporting || list.loading || list.total === 0}>
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>
      <form className="filters" onSubmit={apply} noValidate aria-label="Filter workouts">
        <div className="field">
          <label htmlFor="mod-w-q">Search</label>
          <input
            id="mod-w-q"
            value={draft.q}
            onChange={(e) => setDraft({ ...draft, q: e.target.value })}
            maxLength={100}
            placeholder="Title, notes, owner"
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label htmlFor="mod-w-kind">Kind</label>
          <select id="mod-w-kind" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Draft["kind"] })}>
            <option value="">Personal and group</option>
            <option value="personal">Personal</option>
            <option value="group">In a group</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="mod-w-from">From</label>
          <input id="mod-w-from" type="date" value={draft.date_from} onChange={(e) => setDraft({ ...draft, date_from: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="mod-w-to">To</label>
          <input id="mod-w-to" type="date" value={draft.date_to} onChange={(e) => setDraft({ ...draft, date_to: e.target.value })} />
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
        <strong>{list.total}</strong> workout{list.total === 1 ? "" : "s"}
        <span className="hint"> · dates are the workout's date</span>
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
          noun="workout"
          warning="Personal ones disappear from their owner's list, group ones from the group."
          onDelete={async (ids) => (await deleteWorkouts(ids)).deleted}
          onDone={(message) => {
            setNotice(message)
            setReloadKey((k) => k + 1)
          }}
          onClear={() => setCheckedIds([])}
        />
      )}
      {list.loading && list.items.length === 0 ? (
        <p className="empty">Loading workouts…</p>
      ) : list.items.length === 0 ? (
        <p className="empty">No workouts match these filters.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="check">
                  <input
                    type="checkbox"
                    aria-label="Select all workouts shown"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = checkedIds.length > 0 && !allChecked
                    }}
                    onChange={() => setCheckedIds(allChecked ? [] : list.items.map((w) => w.id))}
                  />
                </th>
                <th>Date</th>
                <th>Workout</th>
                <th>Owner</th>
                <th>Group</th>
                <th>Assigned to</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((w) => (
                <tr key={w.id}>
                  <td className="check">
                    <input type="checkbox" aria-label={`Select ${w.title}`} checked={checkedIds.includes(w.id)} onChange={() => toggle(w.id)} />
                  </td>
                  <td>{formatDate(w.workout_date)}</td>
                  <td className="wrap">
                    <strong className="wrap-text">{w.title}</strong>
                    {w.notes && <div className="hint wrap-text">{w.notes.length > 120 ? `${w.notes.slice(0, 120)}…` : w.notes}</div>}
                  </td>
                  <td className="wrap">
                    {w.owner_id !== null ? (
                      <button
                        type="button"
                        className="linklike"
                        title="Show only this person's content"
                        onClick={() => onPickOwner(w.owner_id ?? 0, w.owner_name ?? `account #${w.owner_id}`)}
                      >
                        {w.owner_name}
                      </button>
                    ) : (
                      <span className="hint">Deleted account</span>
                    )}
                    {w.owner_email && <div className="hint">{w.owner_email}</div>}
                  </td>
                  <td>{w.group_name ?? <span className="hint">Personal</span>}</td>
                  <td>{w.assigned_to_name ?? "—"}</td>
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
