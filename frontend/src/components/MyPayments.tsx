import { useShowMore } from "../hooks/useShowMore"
import { listMyPayments } from "../services/paymentService"
import type { Payment } from "../types/payment"
import ListState from "./ListState"
import PaymentRow from "./PaymentRow"
import ShowMore from "./ShowMore"

const PAGE_SIZE = 5

// The logged-in member's own payments, newest first. Nobody else's can be read from here.
export default function MyPayments() {
  const list = useShowMore<Payment>((offset) => listMyPayments(offset, PAGE_SIZE))
  return (
    <section className="card">
      <h2>My payments {list.total > 0 && <span className="hint">({list.total})</span>}</h2>
      <ListState loading={list.loading} error={list.error} isEmpty={list.items.length === 0} empty="No payments yet.">
        <ul className="rows">
          {list.items.map((p) => (
            <PaymentRow key={p.id} payment={p} />
          ))}
        </ul>
      </ListState>
      <ShowMore shown={list.items.length} total={list.total} loading={list.loadingMore} onClick={list.showMore} />
    </section>
  )
}
