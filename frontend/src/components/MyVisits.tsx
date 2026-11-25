import { useShowMore } from "../hooks/useShowMore"
import { listMyCheckIns } from "../services/meService"
import type { CheckIn } from "../types/checkIn"
import ListState from "./ListState"
import ShowMore from "./ShowMore"
import VisitRow from "./VisitRow"

const PAGE_SIZE = 5

// The logged-in member's own visits, newest first.
export default function MyVisits() {
  const list = useShowMore<CheckIn>((offset) => listMyCheckIns(offset, PAGE_SIZE))
  return (
    <section className="card">
      <h2>My visits {list.total > 0 && <span className="hint">({list.total})</span>}</h2>
      <ListState loading={list.loading} error={list.error} isEmpty={list.items.length === 0} empty="No visits yet.">
        <ul className="rows">
          {list.items.map((v) => (
            <VisitRow key={v.id} visit={v} />
          ))}
        </ul>
      </ListState>
      <ShowMore shown={list.items.length} total={list.total} loading={list.loadingMore} onClick={list.showMore} />
    </section>
  )
}
