import { useMemo } from "react"
import { usePagedList } from "../hooks/usePagedList"
import { listWaiting } from "../services/memberService"
import { formatDate } from "../utils/time"
import ListState from "./ListState"
import Pager from "./Pager"

interface Props {
  q: string
  empty: string
  onStart: (email: string) => void
}

// People who signed up but have no membership yet: the front desk starts one with a click instead of typing the email.
export default function WaitingTable({ q, empty, onStart }: Props) {
  const filters = useMemo(() => ({ q }), [q])
  const list = usePagedList(listWaiting, filters)
  return (
    <ListState loading={list.loading} error={list.error} isEmpty={list.items.length === 0} empty={q ? `Nobody waiting matches "${q}".` : empty}>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th>Signed up</th>
              <th className="act">
                <span className="visually-hidden">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((a) => (
              <tr key={a.id}>
                <td className="name">
                  {a.name}
                  <span className="hint">{a.email}</span>
                </td>
                <td data-label="Signed up">{formatDate(a.created_at)}</td>
                <td className="act">
                  <div className="actions">
                    <button type="button" className="small primary" onClick={() => onStart(a.email)}>
                      Start membership
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
  )
}
