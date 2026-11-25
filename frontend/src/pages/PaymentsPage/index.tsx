import { type FormEvent, useEffect, useState } from "react"
import Alert from "../../components/Alert"
import ExportButton from "../../components/ExportButton"
import FormActions from "../../components/FormActions"
import ListState from "../../components/ListState"
import Modal from "../../components/Modal"
import PageHeader from "../../components/PageHeader"
import Pager from "../../components/Pager"
import { useAuth } from "../../context/AuthContext"
import { usePlans } from "../../context/PlansContext"
import { useDebouncedValue } from "../../hooks/useDebouncedValue"
import { usePagedList } from "../../hooks/usePagedList"
import { useSave } from "../../hooks/useSave"
import { exportPaymentsCsv, listPayments, voidPayment } from "../../services/paymentService"
import type { Payment, PaymentFilters, PaymentMethod } from "../../types/payment"
import { can } from "../../utils/auth"
import { hashDay, pageLink, replaceHash } from "../../utils/hash"
import { membersLink } from "../../utils/member"
import { METHODS, formatMoney, methodLabel } from "../../utils/payment"
import { count } from "../../utils/text"
import { formatDate, formatDateTime } from "../../utils/time"

const NO_FILTERS: PaymentFilters = { date_from: "", date_to: "", method: "", member: "", include_voided: false }

/** The date range named in the address (#/payments?from=2026-11-20&to=2026-11-20), so other pages can link to a day. */
const filtersFromHash = (): PaymentFilters => ({ ...NO_FILTERS, date_from: hashDay("from"), date_to: hashDay("to") })

function VoidForm({ payment, onDone, onCancel }: { payment: Payment; onDone: () => void; onCancel: () => void }) {
  const [reason, setReason] = useState("")
  const { saving, error, setError, run } = useSave()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!reason.trim()) return setError("Enter the reason for voiding this payment.")
    void run(async () => {
      await voidPayment(payment.id, reason.trim())
      onDone()
    })
  }

  return (
    <form className="fields" onSubmit={handleSubmit} noValidate>
      <p className="wide">
        {formatMoney(payment.amount)} from {payment.member_name} stays on record but no longer counts towards any total. The member's expiry
        date does not change.
      </p>
      <div className="field wide">
        <label htmlFor="void-reason">Reason</label>
        <input id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} autoFocus autoComplete="off" />
      </div>
      <FormActions label="Void payment" saving={saving} error={error} danger onCancel={onCancel} />
    </form>
  )
}

// Gym Managers and Admins: every payment, newest first, with filters and the total of what is shown.
// Admins can also void a mistaken payment and export the list as CSV.
export default function PaymentsPage() {
  const { planLabel } = usePlans()
  const { user } = useAuth()
  // Void and Export CSV follow the same permissions the API checks.
  const canVoid = can(user, "payments:void")
  // What the filter boxes show, and (once the typing pauses) what the list is loaded with.
  const [draft, setDraft] = useState<PaymentFilters>(filtersFromHash)
  const filters = useDebouncedValue(draft)
  const [reloadKey, setReloadKey] = useState(0)
  const list = usePagedList(listPayments, filters, reloadKey)
  const [voiding, setVoiding] = useState<Payment | null>(null)
  const [notice, setNotice] = useState("")
  const [exportError, setExportError] = useState("")

  useEffect(() => replaceHash(pageLink("payments", { from: filters.date_from, to: filters.date_to })), [filters])

  // The menu link, followed while this page is open, clears them.
  useEffect(() => {
    const onChange = () => setDraft(filtersFromHash())
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [])

  return (
    <div className="page">
      <PageHeader title="Payments" subtitle="Payments are taken on a member's page.">
        {can(user, "payments:export") && (
          <ExportButton name="payments" load={() => exportPaymentsCsv(filters)} total={list.total} onError={setExportError} />
        )}
      </PageHeader>
      <section className="card">
        <div className="filters">
          <div className="field">
            <label htmlFor="filter-from">From</label>
            <input id="filter-from" type="date" max={draft.date_to || undefined} value={draft.date_from} onChange={(e) => setDraft({ ...draft, date_from: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="filter-to">To</label>
            <input id="filter-to" type="date" min={draft.date_from || undefined} value={draft.date_to} onChange={(e) => setDraft({ ...draft, date_to: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="filter-method">Method</label>
            <select id="filter-method" value={draft.method} onChange={(e) => setDraft({ ...draft, method: e.target.value as PaymentMethod | "" })}>
              <option value="">Any</option>
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="filter-member">Member</label>
            <input id="filter-member" type="search" value={draft.member} onChange={(e) => setDraft({ ...draft, member: e.target.value })} maxLength={100} placeholder="Name" autoComplete="off" />
          </div>
          <label className="checkbox-row" htmlFor="filter-voided">
            <input id="filter-voided" type="checkbox" checked={draft.include_voided} onChange={(e) => setDraft({ ...draft, include_voided: e.target.checked })} />
            Show voided
          </label>
          <button type="button" onClick={() => setDraft(NO_FILTERS)}>
            Clear
          </button>
        </div>
        <p className="summary">
          <strong>{formatMoney(list.data?.total_amount ?? 0)}</strong> from {count(list.total, "payment")}
          {filters.include_voided && <span className="hint"> (voided ones are listed but not counted)</span>}
        </p>
        <Alert kind="success">{notice}</Alert>
        <Alert>{exportError}</Alert>
        <ListState loading={list.loading} error={list.error} isEmpty={list.items.length === 0} empty="No payments match these filters.">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Paid</th>
                  <th className="number">Amount</th>
                  <th>Method</th>
                  <th>For</th>
                  <th>Recorded by</th>
                  {canVoid && (
                    <th className="act">
                      <span className="visually-hidden">Action</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {list.items.map((p) => (
                  <tr key={p.id}>
                    <td className="name">
                      {p.member_id === null ? p.member_name : <a href={membersLink({ member: p.member_id })}>{p.member_name}</a>}
                      {p.member_id === null && <span className="hint">Account deleted</span>}
                    </td>
                    <td data-label="Paid">{formatDateTime(p.paid_at)}</td>
                    <td data-label="Amount" className={p.voided_at ? "number struck" : "number"}>
                      {formatMoney(p.amount)}
                    </td>
                    <td data-label="Method">{methodLabel(p.method)}</td>
                    <td data-label="For">
                      <span>
                        {p.plan && p.renewed_until ? `${planLabel(p.plan)}, to ${formatDate(p.renewed_until)}` : p.note ? p.note : "—"}
                        {p.plan && p.note && <span className="hint">{p.note}</span>}
                        {p.voided_at && (
                          <span className="hint">
                            <span className="pill bad">Voided</span> {formatDate(p.voided_at)}
                            {p.voided_by_name && ` by ${p.voided_by_name}`}
                            {p.void_reason && `: ${p.void_reason}`}
                          </span>
                        )}
                      </span>
                    </td>
                    <td data-label="Recorded by">{p.recorded_by_name ?? "—"}</td>
                    {canVoid && (
                      <td className="act">
                        {!p.voided_at && (
                          <div className="actions">
                            <button type="button" className="small danger" onClick={() => setVoiding(p)}>
                              Void
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager {...list} onChange={list.goTo} />
        </ListState>
      </section>
      {voiding && (
        <Modal title="Void this payment?" onClose={() => setVoiding(null)} narrow>
          <VoidForm
            payment={voiding}
            onCancel={() => setVoiding(null)}
            onDone={() => {
              setNotice(`${formatMoney(voiding.amount)} from ${voiding.member_name} is voided.`)
              setVoiding(null)
              setReloadKey((k) => k + 1)
            }}
          />
        </Modal>
      )}
    </div>
  )
}
