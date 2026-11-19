import { useEffect, useState } from "react"
import { listMyPayments } from "../services/paymentService"
import type { Payment } from "../types/payment"
import { errorText } from "../utils/member"
import PaymentLine from "./PaymentLine"

const PAGE_SIZE = 5

// The logged-in member's own payments, newest first. Nobody else's can be read from here.
export default function MyPayments() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let ignore = false
    listMyPayments(0, PAGE_SIZE)
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
  }, [])

  async function showMore() {
    setLoadingMore(true)
    try {
      const page = await listMyPayments(payments.length, PAGE_SIZE)
      setPayments((prev) => [...prev, ...page.items])
      setTotal(page.total)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <section className="card" aria-labelledby="my-payments-heading">
      <h2 id="my-payments-heading">My payments {total > 0 && <span className="hint">({total})</span>}</h2>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="empty">Loading your payments…</p>
      ) : payments.length === 0 ? (
        !error && <p className="empty">No payments yet.</p>
      ) : (
        <ul className="visit-list">
          {payments.map((p) => (
            <PaymentLine key={p.id} payment={p} />
          ))}
        </ul>
      )}
      {payments.some((p) => p.voided_at) && (
        <p className="hint">A voided payment was cancelled by the gym, for example because it was entered by mistake.</p>
      )}
      {payments.length < total && (
        <button type="button" onClick={showMore} disabled={loadingMore}>
          {loadingMore ? "Loading…" : "Show older payments"}
        </button>
      )}
    </section>
  )
}
