import { type FormEvent, useEffect, useState } from "react"
import { listMemberPayments, listPlans, recordPayment } from "../services/paymentService"
import type { Member, Plan } from "../types/member"
import type { Payment, PaymentMethod, PlanPrice } from "../types/payment"
import { METHODS, addDays, formatMoney, methodLabel } from "../utils/payment"
import { errorText, formatDate, formatDateTime, planLabel, todayUtc } from "../utils/member"

const PAGE_SIZE = 5

interface Props {
  member: Member
  /** A payment was recorded. When it renewed the membership, the panel reloads the member. */
  onRecorded: (renewed: boolean) => void
}

// Take a payment (optionally renewing the membership) and see this member's payment history.
export default function PaymentSection({ member, onRecorded }: Props) {
  const [plans, setPlans] = useState<PlanPrice[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState<PaymentMethod>("cash")
  const [renew, setRenew] = useState(false)
  const [plan, setPlan] = useState<Plan>(member.plan)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  // The panel remounts this section for each member (key), so these load once per member.
  useEffect(() => {
    let ignore = false
    listPlans()
      .then((p) => !ignore && setPlans(p))
      .catch(() => undefined) // the form still works without the suggested price
    listMemberPayments(member.id, 0, PAGE_SIZE)
      .then((page) => {
        if (ignore) return
        setPayments(page.items)
        setTotal(page.total)
      })
      .catch((err) => !ignore && setError(errorText(err)))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [member.id])

  const planInfo = (p: Plan) => plans.find((x) => x.plan === p)
  const selected = renew ? planInfo(plan) : undefined
  // An active member renews from their current expiry, an expired one from today: the same rule the API uses.
  const newExpiry = selected ? addDays(member.expires_on > todayUtc() ? member.expires_on : todayUtc(), selected.duration_days) : null

  function toggleRenew(on: boolean) {
    setRenew(on)
    const price = on ? planInfo(plan)?.price : undefined
    if (price !== undefined) setAmount(String(price))
  }

  function changePlan(next: Plan) {
    setPlan(next)
    const price = planInfo(next)?.price
    if (renew && price !== undefined) setAmount(String(price))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const value = Number(amount)
    setMessage("")
    if (!Number.isInteger(value) || value < 1 || value > 10_000_000) {
      setError("Enter the amount as a whole number from 1 to 10,000,000.")
      return
    }
    setBusy(true)
    setError("")
    try {
      const payment = await recordPayment(member.id, {
        amount: value,
        method,
        note: note.trim() || null,
        renew_plan: renew ? plan : null,
      })
      setPayments((prev) => [payment, ...prev])
      setTotal((n) => n + 1)
      setMessage(
        `Payment of ${formatMoney(payment.amount)} recorded.` +
          (payment.renewed_until ? ` Membership renewed until ${formatDate(payment.renewed_until)}.` : ""),
      )
      setAmount("")
      setNote("")
      setRenew(false)
      onRecorded(payment.renewed_until !== null)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function showMore() {
    setLoadingMore(true)
    try {
      const page = await listMemberPayments(member.id, payments.length, PAGE_SIZE)
      setPayments((prev) => [...prev, ...page.items])
      setTotal(page.total)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoadingMore(false)
    }
  }

  const id = `pay-${member.id}`
  return (
    <section aria-labelledby={`${id}-heading`} className="visits">
      <h3 id={`${id}-heading`}>Payments {total > 0 && <span className="hint">({total})</span>}</h3>
      <form className="stack full" onSubmit={handleSubmit} noValidate>
        <div className="inline">
          <div className="field">
            <label htmlFor={`${id}-amount`}>Amount (৳)</label>
            <input id={`${id}-amount`} type="number" min={1} step={1} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-method`}>Paid by</label>
            <select id={`${id}-method`} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="checkbox-row" htmlFor={`${id}-renew`}>
          <input id={`${id}-renew`} type="checkbox" checked={renew} onChange={(e) => toggleRenew(e.target.checked)} />
          Renew the membership with this payment
        </label>
        {renew && (
          <div className="field">
            <label htmlFor={`${id}-plan`}>Plan</label>
            <select id={`${id}-plan`} value={plan} onChange={(e) => changePlan(e.target.value as Plan)}>
              {(plans.length ? plans.map((p) => p.plan) : [member.plan]).map((p) => (
                <option key={p} value={p}>
                  {planLabel(p)}
                  {planInfo(p) ? ` · ${formatMoney(planInfo(p)!.price)} · ${planInfo(p)!.duration_days} days` : ""}
                </option>
              ))}
            </select>
            {newExpiry && <span className="hint">New expiry: {formatDate(newExpiry)}</span>}
          </div>
        )}
        <div className="field">
          <label htmlFor={`${id}-note`}>Note (optional)</label>
          <input id={`${id}-note`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} autoComplete="off" />
        </div>
        <div className="actions">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "Recording…" : "Record payment"}
          </button>
        </div>
      </form>
      {message && (
        <p className="hint" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="empty">Loading payments…</p>
      ) : payments.length === 0 ? (
        <p className="empty">No payments yet.</p>
      ) : (
        <ul className="visit-list">
          {payments.map((p) => (
            <li key={p.id}>
              <span>
                <strong>{formatMoney(p.amount)}</strong> · {methodLabel(p.method)}
                {p.renewed_until && <span className="hint"> · renewed to {formatDate(p.renewed_until)}</span>}
                {p.note && <span className="hint"> · {p.note}</span>}
              </span>
              <span className="hint">{formatDateTime(p.paid_at)}</span>
            </li>
          ))}
        </ul>
      )}
      {payments.length < total && (
        <button type="button" onClick={showMore} disabled={loadingMore}>
          {loadingMore ? "Loading…" : "Show older payments"}
        </button>
      )}
    </section>
  )
}
