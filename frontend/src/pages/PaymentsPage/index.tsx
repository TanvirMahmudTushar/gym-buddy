import { type FormEvent, Fragment, useEffect, useState } from "react"
import { useAuth } from "../../context/AuthContext"
import { exportPaymentsCsv, listPayments, voidPayment } from "../../services/paymentService"
import type { Payment, PaymentFilters, PaymentMethod } from "../../types/payment"
import { errorText, formatDate, formatDateTime, hashParams, membersLink, planLabel, todayUtc } from "../../utils/member"
import { METHODS, formatMoney, methodLabel, saveFile } from "../../utils/payment"
import { can } from "../../utils/auth"

const NO_FILTERS: PaymentFilters = { date_from: "", date_to: "", method: "", member: "", include_voided: false }

const asDay = (value: string | null) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "")

/** The date range named in the address (#/payments?from=2026-11-20&to=2026-11-20), so other pages can link to a day. */
function filtersFromHash(): PaymentFilters {
  const params = hashParams()
  return { ...NO_FILTERS, date_from: asDay(params.get("from")), date_to: asDay(params.get("to")) }
}

// Gym Managers and Admins: every payment, newest first, with filters and the total of what is shown.
// Admins can also void a mistaken payment and export the list as CSV.
export default function PaymentsPage() {
  const { user } = useAuth()
  // The Void column and Export CSV follow the same permissions the API checks.
  const canVoid = can(user, "payments:void")
  const canExport = can(user, "payments:export")
  // What is typed in the filter form, and the filters the list was last loaded with.
  const [draft, setDraft] = useState<PaymentFilters>(filtersFromHash)
  const [filters, setFilters] = useState<PaymentFilters>(filtersFromHash)
  const [payments, setPayments] = useState<Payment[]>([])
  const [total, setTotal] = useState(0)
  const [totalAmount, setTotalAmount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState("")
  const [filterError, setFilterError] = useState("")
  const [notice, setNotice] = useState("")
  const [exporting, setExporting] = useState(false)
  // The payment an admin is about to void, the reason typed so far, and the one a request is running for.
  const [voidingId, setVoidingId] = useState<number | null>(null)
  const [reason, setReason] = useState("")
  const [voidError, setVoidError] = useState("")
  const [savingId, setSavingId] = useState<number | null>(null)

  // Keep the date range in the address, so a reload or a shared link shows the same days.
  useEffect(() => {
    const params = new URLSearchParams()
    if (filters.date_from) params.set("from", filters.date_from)
    if (filters.date_to) params.set("to", filters.date_to)
    window.history.replaceState(null, "", params.toString() ? `#/payments?${params}` : "#/payments")
  }, [filters])

  useEffect(() => {
    let ignore = false
    setLoading(true)
    setError("")
    listPayments(filters, 0)
      .then((page) => {
        if (ignore) return
        setPayments(page.items)
        setTotal(page.total)
        setTotalAmount(page.total_amount)
      })
      .catch((err) => !ignore && setError(errorText(err)))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [filters])

  function resetMessages() {
    setFilterError("")
    setNotice("")
    setVoidingId(null)
  }

  function apply(e: FormEvent) {
    e.preventDefault()
    if (draft.date_from && draft.date_to && draft.date_from > draft.date_to) {
      setFilterError("The From date must be on or before the To date.")
      return
    }
    resetMessages()
    setFilters({ ...draft, member: draft.member.trim() })
  }

  function clear() {
    resetMessages()
    setDraft(NO_FILTERS)
    setFilters(NO_FILTERS)
  }

  async function loadMore() {
    setLoadingMore(true)
    try {
      const page = await listPayments(filters, payments.length)
      setPayments((prev) => [...prev, ...page.items])
      setTotal(page.total)
      setTotalAmount(page.total_amount)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoadingMore(false)
    }
  }

  async function exportCsv() {
    setExporting(true)
    setError("")
    try {
      saveFile(await exportPaymentsCsv(filters), `payments-${todayUtc()}.csv`)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setExporting(false)
    }
  }

  function startVoid(id: number) {
    setVoidingId(id)
    setReason("")
    setVoidError("")
    setNotice("")
  }

  async function handleVoid(e: FormEvent, payment: Payment) {
    e.preventDefault()
    if (!reason.trim()) {
      setVoidError("Enter the reason for voiding this payment.")
      return
    }
    setSavingId(payment.id)
    setVoidError("")
    try {
      const updated = await voidPayment(payment.id, reason.trim())
      if (filters.include_voided) {
        setPayments((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
      } else {
        setPayments((prev) => prev.filter((p) => p.id !== updated.id))
        setTotal((n) => n - 1)
      }
      setTotalAmount((sum) => sum - payment.amount)
      setNotice(`${formatMoney(payment.amount)} from ${payment.member_name} is voided. It stays on record but no longer counts towards totals.`)
      setVoidingId(null)
    } catch (err) {
      setVoidError(errorText(err))
    } finally {
      setSavingId(null)
    }
  }

  const columns = canVoid ? 8 : 7

  let body
  if (loading && payments.length === 0) body = <p className="empty">Loading payments…</p>
  else if (payments.length === 0) body = <p className="empty">No payments match these filters.</p>
  else
    body = (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Paid</th>
              <th>Member</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Details</th>
              <th>Recorded by</th>
              <th>Status</th>
              {canVoid && <th>Action</th>}
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => {
              const busy = savingId === p.id
              return (
                <Fragment key={p.id}>
                  <tr>
                    <td>{formatDateTime(p.paid_at)}</td>
                    <td className="name">
                      {p.member_id === null ? (
                        <>
                          {p.member_name}
                          <div className="hint">Account deleted</div>
                        </>
                      ) : (
                        <a href={membersLink({ member: p.member_id })}>{p.member_name}</a>
                      )}
                    </td>
                    <td className={p.voided_at ? "voided-amount" : undefined}>{formatMoney(p.amount)}</td>
                    <td>{methodLabel(p.method)}</td>
                    <td className="wrap">
                      {p.plan && p.renewed_until ? `${planLabel(p.plan)}, renewed to ${formatDate(p.renewed_until)}` : "—"}
                      {p.note && <div className="hint">{p.note}</div>}
                    </td>
                    <td>{p.recorded_by_name ?? "—"}</td>
                    <td className="wrap">
                      {p.voided_at ? (
                        <>
                          <span className="pill voided">Voided</span>
                          <div className="hint">
                            {formatDate(p.voided_at)}
                            {p.voided_by_name && ` by ${p.voided_by_name}`}
                            {p.void_reason && ` · ${p.void_reason}`}
                          </div>
                        </>
                      ) : (
                        <span className="pill active">Paid</span>
                      )}
                    </td>
                    {canVoid && (
                      <td>
                        {p.voided_at ? (
                          <span className="hint">—</span>
                        ) : (
                          <button className="danger" onClick={() => startVoid(p.id)} disabled={busy || voidingId === p.id}>
                            Void
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                  {voidingId === p.id && (
                    <tr className="void-row">
                      <td colSpan={columns}>
                        <form className="void-form" onSubmit={(e) => handleVoid(e, p)} noValidate>
                          <div className="field">
                            <label htmlFor={`void-reason-${p.id}`}>
                              Reason for voiding {formatMoney(p.amount)} from {p.member_name}
                            </label>
                            <input
                              id={`void-reason-${p.id}`}
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              maxLength={200}
                              autoFocus
                              autoComplete="off"
                            />
                          </div>
                          <button className="danger solid" type="submit" disabled={busy}>
                            {busy ? "Voiding…" : "Void payment"}
                          </button>
                          <button type="button" onClick={() => setVoidingId(null)} disabled={busy}>
                            Cancel
                          </button>
                        </form>
                        <p className="hint">
                          The payment stays on record. Voiding does not change the member's expiry date; change it on
                          the Members page if needed.
                        </p>
                        {voidError && (
                          <p className="error" role="alert">
                            {voidError}
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    )

  return (
    <section className="card" aria-labelledby="payments-heading">
      <div className="toolbar">
        <h2 id="payments-heading">Payments</h2>
        {canExport && (
          <button onClick={exportCsv} disabled={exporting || loading}>
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        )}
      </div>
      <form className="filters" onSubmit={apply} noValidate aria-label="Filter payments">
        <div className="field">
          <label htmlFor="filter-from">From</label>
          <input id="filter-from" type="date" value={draft.date_from} onChange={(e) => setDraft({ ...draft, date_from: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="filter-to">To</label>
          <input id="filter-to" type="date" value={draft.date_to} onChange={(e) => setDraft({ ...draft, date_to: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="filter-method">Method</label>
          <select
            id="filter-method"
            value={draft.method}
            onChange={(e) => setDraft({ ...draft, method: e.target.value as PaymentMethod | "" })}
          >
            <option value="">Any</option>
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="filter-member">Member name</label>
          <input
            id="filter-member"
            value={draft.member}
            onChange={(e) => setDraft({ ...draft, member: e.target.value })}
            maxLength={100}
            placeholder="Any"
            autoComplete="off"
          />
        </div>
        <label className="checkbox-row" htmlFor="filter-voided">
          <input
            id="filter-voided"
            type="checkbox"
            checked={draft.include_voided}
            onChange={(e) => setDraft({ ...draft, include_voided: e.target.checked })}
          />
          Show voided payments
        </label>
        <div className="actions">
          <button className="primary" type="submit" disabled={loading}>
            Apply
          </button>
          <button type="button" onClick={clear} disabled={loading}>
            Clear
          </button>
        </div>
      </form>
      {filterError && (
        <p className="error" role="alert">
          {filterError}
        </p>
      )}
      <p className="summary" aria-live="polite">
        <strong>{formatMoney(totalAmount)}</strong> from {total} payment{total === 1 ? "" : "s"}
        <span className="hint">
          {" "}
          · dates are in UTC{filters.include_voided ? " · voided payments are listed but not counted" : ""}
        </span>
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="hint" role="status">
          {notice}
        </p>
      )}
      {body}
      {payments.length > 0 && (
        <div className="list-foot">
          <span>
            Showing {payments.length} of {total}
          </span>
          {payments.length < total && (
            <button onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
