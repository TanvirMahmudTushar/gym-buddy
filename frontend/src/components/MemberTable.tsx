import { useCallback, useMemo, useState } from "react"
import { usePlans } from "../context/PlansContext"
import { usePagedList } from "../hooks/usePagedList"
import { useSelection } from "../hooks/useSelection"
import { deleteMembers, listMembers } from "../services/memberService"
import type { MemberFilter } from "../types/member"
import { expiresSoonNote, memberStatus, membersLink } from "../utils/member"
import { formatDate } from "../utils/time"
import Alert from "./Alert"
import BulkDelete from "./BulkDelete"
import ListState from "./ListState"
import Pager from "./Pager"
import StatusPill from "./StatusPill"
import TickAll from "./TickAll"

interface Props {
  status: MemberFilter | null
  q: string
  empty: string
}

// The members, newest first, with the search and the status filter. A name opens the member.
export default function MemberTable({ status, q, empty }: Props) {
  const { planLabel } = usePlans()
  const filters = useMemo(() => ({ status, q }), [status, q])
  const [reloadKey, setReloadKey] = useState(0)
  const list = usePagedList(listMembers, filters, reloadKey)
  const selection = useSelection(list.items.map((m) => m.id))
  const [notice, setNotice] = useState("")

  const remove = useCallback(async (ids: number[]) => {
    const { deleted } = await deleteMembers(ids)
    setNotice(`Deleted ${deleted} account${deleted === 1 ? "" : "s"}.`)
    setReloadKey((k) => k + 1)
  }, [])

  return (
    <>
      <Alert kind="success">{notice}</Alert>
      <BulkDelete
        selection={selection}
        noun="member"
        warning="Their accounts are deleted: they can no longer log in, and their check-ins and bookings go. Payments stay on record."
        onDelete={remove}
      />
      <ListState loading={list.loading} error={list.error} isEmpty={list.items.length === 0} empty={q ? `No members match "${q}".` : empty}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <TickAll selection={selection} label="Select all members shown" />
                <th>Member</th>
                <th>Phone</th>
                <th>Plan</th>
                <th>Trainer</th>
                <th>Expires</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((m) => (
                <tr key={m.id}>
                  <td className="tick" data-label="Select">
                    <input type="checkbox" aria-label={`Select ${m.name}`} checked={selection.has(m.id)} onChange={() => selection.toggle(m.id)} />
                  </td>
                  <td className="name">
                    <a href={membersLink({ member: m.id })}>{m.name}</a>
                    <span className="hint">{m.email}</span>
                  </td>
                  <td data-label="Phone">{m.phone ?? "—"}</td>
                  <td data-label="Plan">{planLabel(m.plan)}</td>
                  <td data-label="Trainer">{m.trainer_name ?? "—"}</td>
                  <td data-label="Expires" className="nowrap">
                    <span>
                      {formatDate(m.expires_on)}
                      <span className="hint">{expiresSoonNote(m)}</span>
                    </span>
                  </td>
                  <td data-label="Status">
                    <StatusPill status={memberStatus(m)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager {...list} onChange={list.goTo} />
      </ListState>
    </>
  )
}
