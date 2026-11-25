import type { Payment } from "../types/payment"
import { formatMoney, methodLabel } from "../utils/payment"
import { formatDate } from "../utils/time"

// One payment in a short list. A voided payment is struck through and says why.
export default function PaymentRow({ payment: p }: { payment: Payment }) {
  const details = [
    p.renewed_until && `renewed to ${formatDate(p.renewed_until)}`,
    p.note,
    p.voided_at && `voided${p.void_reason ? `: ${p.void_reason}` : ""}`,
  ].filter(Boolean)
  return (
    <li>
      <span>
        <strong className={p.voided_at ? "struck" : undefined}>{formatMoney(p.amount)}</strong> {methodLabel(p.method).toLowerCase()}{" "}
        {p.voided_at && <span className="pill bad">Voided</span>}
        {details.length > 0 && <span className="row-note hint">{details.join(" · ")}</span>}
      </span>
      <span className="hint">{formatDate(p.paid_at)}</span>
    </li>
  )
}
