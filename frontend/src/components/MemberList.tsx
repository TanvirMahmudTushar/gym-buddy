import { type KeyboardEvent } from "react"
import type { Member, MemberStatus } from "../types/member"
import { formatDate, memberStatus, planLabel } from "../utils/member"
import BulkDeleteBar from "./BulkDeleteBar"
import StatusPill from "./StatusPill"

export type Filter = MemberStatus | "all"

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "expired", label: "Expired" },
  { value: "frozen", label: "Frozen" },
]

interface Props {
  members: Member[]
  filter: Filter
  onFilterChange: (filter: Filter) => void
  selectedId: number | null
  onSelect: (id: number) => void
  loading: boolean
  error: string
  total: number
  loadingMore: boolean
  onLoadMore: () => void
  checkedIds: number[]
  onCheckedChange: (ids: number[]) => void
  onBulkDeleted: (ids: number[]) => void
}

export default function MemberList(props: Props) {
  const { members, filter, selectedId, onSelect, loading, error, total, checkedIds, onCheckedChange } = props

  const allChecked = members.length > 0 && checkedIds.length === members.length

  function toggleChecked(id: number) {
    onCheckedChange(checkedIds.includes(id) ? checkedIds.filter((c) => c !== id) : [...checkedIds, id])
  }

  function handleKey(e: KeyboardEvent, id: number) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      onSelect(id)
    }
  }

  let body
  // Keep the current rows on screen while a reload runs, so the table does not flicker after each change.
  if (loading && members.length === 0) body = <p className="empty">Loading members…</p>
  else if (error) body = <p className="error">{error}</p>
  else if (members.length === 0)
    body = <p className="empty">{filter === "all" ? "No members yet. Add the first one above." : `No ${filter} members.`}</p>
  else
    body = (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="check">
                <input
                  type="checkbox"
                  aria-label="Select all members shown"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = checkedIds.length > 0 && !allChecked
                  }}
                  onChange={() => onCheckedChange(allChecked ? [] : members.map((m) => m.id))}
                />
              </th>
              <th>Name</th>
              <th>Plan</th>
              <th>Expires</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr
                key={m.id}
                tabIndex={0}
                aria-selected={m.id === selectedId}
                onClick={() => onSelect(m.id)}
                onKeyDown={(e) => handleKey(e, m.id)}
              >
                {/* Ticking a box must not also open the details panel. */}
                <td className="check" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${m.full_name}`}
                    checked={checkedIds.includes(m.id)}
                    onChange={() => toggleChecked(m.id)}
                  />
                </td>
                <td className="name">{m.full_name}</td>
                <td>{planLabel(m.plan)}</td>
                <td>{formatDate(m.expires_on)}</td>
                <td>
                  <StatusPill status={memberStatus(m)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )

  return (
    <section className="card" aria-labelledby="list-heading">
      <div className="toolbar">
        <h2 id="list-heading">Members</h2>
        <div className="chips" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className="chip"
              aria-pressed={filter === f.value}
              onClick={() => props.onFilterChange(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {checkedIds.length > 0 && (
        <BulkDeleteBar ids={checkedIds} onDeleted={props.onBulkDeleted} onClear={() => onCheckedChange([])} />
      )}
      {body}
      {!error && members.length > 0 && (
        <div className="list-foot">
          <span>
            Showing {members.length} of {total} member{total === 1 ? "" : "s"}
          </span>
          {members.length < total && (
            <button type="button" onClick={props.onLoadMore} disabled={props.loadingMore}>
              {props.loadingMore ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
