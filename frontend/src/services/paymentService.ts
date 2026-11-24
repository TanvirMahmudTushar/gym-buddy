// fetch helpers for payments. Recording and reading payments is for gym managers and admins;
// voiding and the CSV export are for admins; a member reads only their own payments.
import type { Payment, PaymentBody, PaymentFilters, PaymentListPage, PaymentPage } from "../types/payment"
import { request, requestBlob } from "./api"

const PAGE_SIZE = 20

export const recordPayment = (memberId: number, body: PaymentBody) =>
  request<Payment>(`/api/v1/members/${memberId}/payments`, { method: "POST", body: JSON.stringify(body) })

export function listMemberPayments(memberId: number, offset: number, limit: number): Promise<PaymentPage> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) })
  return request<PaymentPage>(`/api/v1/members/${memberId}/payments?${params}`)
}

/** Only the filters that are set go into the query string. */
function filterParams(filters: PaymentFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.date_from) params.set("date_from", filters.date_from)
  if (filters.date_to) params.set("date_to", filters.date_to)
  if (filters.method) params.set("method", filters.method)
  if (filters.member.trim()) params.set("member", filters.member.trim())
  if (filters.include_voided) params.set("include_voided", "true")
  return params
}

export function listPayments(filters: PaymentFilters, offset: number): Promise<PaymentListPage> {
  const params = filterParams(filters)
  params.set("offset", String(offset))
  params.set("limit", String(PAGE_SIZE))
  return request<PaymentListPage>(`/api/v1/payments?${params}`)
}

export const voidPayment = (id: number, reason: string) =>
  request<Payment>(`/api/v1/payments/${id}/void`, { method: "POST", body: JSON.stringify({ reason }) })

export const exportPaymentsCsv = (filters: PaymentFilters) =>
  requestBlob(`/api/v1/payments/export.csv?${filterParams(filters)}`)

export function listMyPayments(offset: number, limit: number): Promise<PaymentPage> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) })
  return request<PaymentPage>(`/api/v1/users/me/payments?${params}`)
}
