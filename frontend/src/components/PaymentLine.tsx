import type { Payment } from "../types/payment"
import { formatDate, formatDateTime } from "../utils/member"
import { formatMoney, methodLabel } from "../utils/payment"

// One payment in a short list (a member's payments). A voided payment is struck through and says why.
export default function PaymentLine({ payment: p }: { payment: Payment }) {
  return (
    <li>
      <span>
        <strong className={p.voided_at ? "voided-amount" : undefined}>{formatMoney(p.amount)}</strong> · {methodLabel(p.method)}
        {p.renewed_until && <span className="hint"> · renewed to {formatDate(p.renewed_until)}</span>}
        {p.note && <span className="hint"> · {p.note}</span>}
        {p.voided_at && (
          <>
            {" "}
            <span className="pill voided">Voided</span>
            {p.void_reason && <span className="hint"> {p.void_reason}</span>}
          </>
        )}
      </span>
      <span className="hint">{formatDateTime(p.paid_at)}</span>
    </li>
  )
}
