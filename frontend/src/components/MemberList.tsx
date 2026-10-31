import { type KeyboardEvent } from "react"
import { type Member, type MemberStatus, formatDate, memberStatus, planLabel } from "../members"
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
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
}

export default function MemberList(props: Props) {
  const { members, filter, selectedId, onSelect, loading, error } = props

  function handleKey(e: KeyboardEvent, id: number) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      onSelect(id)
    }
  }

  let body
  if (loading) body = <p className="empty">Loading members…</p>
  else if (error) body = <p className="error">{error}</p>
  else if (members.length === 0)
    body = <p className="empty">{filter === "all" ? "No members yet. Add the first one above." : `No ${filter} members.`}</p>
  else
    body = (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
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
      {body}
      {!loading && !error && members.length > 0 && (
        <div className="list-foot">
          <span>
            Showing {members.length} member{members.length === 1 ? "" : "s"}
          </span>
          {props.hasMore && (
            <button type="button" onClick={props.onLoadMore} disabled={props.loadingMore}>
              {props.loadingMore ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
