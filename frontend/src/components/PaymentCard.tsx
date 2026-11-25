import { type FormEvent, useState } from "react"
import { usePlans } from "../context/PlansContext"
import { useSave } from "../hooks/useSave"
import { useShowMore } from "../hooks/useShowMore"
import { listMemberPayments, recordPayment } from "../services/paymentService"
import type { Member, Plan } from "../types/member"
import type { Payment, PaymentMethod } from "../types/payment"
import { METHODS, formatMoney } from "../utils/payment"
import { addDays, formatDate, gymToday } from "../utils/time"
import Alert from "./Alert"
import FormActions from "./FormActions"
import ListState from "./ListState"
import Modal from "./Modal"
import PaymentRow from "./PaymentRow"
import ShowMore from "./ShowMore"

const PAGE_SIZE = 5

interface FormProps {
  member: Member
  onRecorded: (payment: Payment) => void
  onCancel: () => void
}

// Take a payment, and renew the membership with it unless that is unticked.
function PaymentForm({ member, onRecorded, onCancel }: FormProps) {
  const { offered } = usePlans()
  // The member's own plan, or the cheapest offered one when theirs was retired.
  const [plan, setPlan] = useState<Plan>(offered.some((p) => p.plan === member.plan) ? member.plan : (offered[0]?.plan ?? ""))
  const [renew, setRenew] = useState(offered.length > 0)
  const chosen = offered.find((p) => p.plan === plan)
  const [amount, setAmount] = useState(chosen ? String(chosen.price) : "")
  const [method, setMethod] = useState<PaymentMethod>("cash")
  const [note, setNote] = useState("")
  const { saving, error, setError, run } = useSave()
  // An active member renews from their current expiry, an expired one from today: the same rule the API uses.
  const newExpiry = chosen && addDays(member.expires_on > gymToday() ? member.expires_on : gymToday(), chosen.duration_days)

  function choose(next: Plan) {
    setPlan(next)
    const price = offered.find((p) => p.plan === next)?.price
    if (price !== undefined) setAmount(String(price))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const value = Number(amount)
    if (!Number.isInteger(value) || value < 1 || value > 10_000_000) {
      setError("Enter the amount as a whole number from 1 to 10,000,000.")
      return
    }
    void run(async () =>
      onRecorded(await recordPayment(member.id, { amount: value, method, note: note.trim() || null, renew_plan: renew ? plan : null })),
    )
  }

  return (
    <form className="fields" onSubmit={handleSubmit} noValidate>
      <label className="checkbox-row wide" htmlFor="pay-renew">
        <input id="pay-renew" type="checkbox" checked={renew} onChange={(e) => setRenew(e.target.checked)} disabled={offered.length === 0} />
        Renew the membership with this payment
      </label>
      {renew && (
        <div className="field wide">
          <label htmlFor="pay-plan">Plan</label>
          <select id="pay-plan" value={plan} onChange={(e) => choose(e.target.value)}>
            {offered.map((p) => (
              <option key={p.plan} value={p.plan}>
                {p.name} · {formatMoney(p.price)} · {p.duration_days} days
              </option>
            ))}
          </select>
          {newExpiry && <span className="hint">New expiry date: {formatDate(newExpiry)}</span>}
        </div>
      )}
      <div className="field">
        <label htmlFor="pay-amount">Amount (taka)</label>
        <input id="pay-amount" type="number" min={1} step={1} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="pay-method">Paid by</label>
        <select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          {METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field wide">
        <label htmlFor="pay-note">Note (optional)</label>
        <input id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} autoComplete="off" />
      </div>
      <FormActions label="Record payment" saving={saving} error={error} onCancel={onCancel} />
    </form>
  )
}

interface Props {
  member: Member
  /** A payment renewed the membership, so the member must be loaded again. */
  onRenewed: () => void
}

// A member's payments, with Take a payment.
export default function PaymentCard({ member, onRenewed }: Props) {
  const list = useShowMore<Payment>((offset) => listMemberPayments(member.id, offset, PAGE_SIZE))
  const [taking, setTaking] = useState(false)
  const [message, setMessage] = useState("")

  function handleRecorded(payment: Payment) {
    list.setItems((prev) => [payment, ...prev])
    list.setTotal((n) => n + 1)
    setTaking(false)
    setMessage(
      `${formatMoney(payment.amount)} recorded.` + (payment.renewed_until ? ` Membership renewed to ${formatDate(payment.renewed_until)}.` : ""),
    )
    if (payment.renewed_until) onRenewed()
  }

  return (
    <section className="card">
      <div className="toolbar">
        <h2>Payments {list.total > 0 && <span className="hint">({list.total})</span>}</h2>
        <button type="button" className="small primary" onClick={() => setTaking(true)}>
          Take a payment
        </button>
      </div>
      <Alert kind="success">{message}</Alert>
      <ListState loading={list.loading} error={list.error} isEmpty={list.items.length === 0} empty="No payments yet.">
        <ul className="rows">
          {list.items.map((p) => (
            <PaymentRow key={p.id} payment={p} />
          ))}
        </ul>
      </ListState>
      <ShowMore shown={list.items.length} total={list.total} loading={list.loadingMore} onClick={list.showMore} />
      {taking && (
        <Modal title={`Payment from ${member.name}`} onClose={() => setTaking(false)}>
          <PaymentForm member={member} onRecorded={handleRecorded} onCancel={() => setTaking(false)} />
        </Modal>
      )}
    </section>
  )
}
