// fetch helpers for plans and payments. Recording and reading payments is for gym managers and admins.
import type { Payment, PaymentBody, PaymentPage, PlanPrice } from "../types/payment"
import { request } from "./api"

export const listPlans = () => request<PlanPrice[]>("/api/v1/plans")

export const recordPayment = (memberId: number, body: PaymentBody) =>
  request<Payment>(`/api/v1/members/${memberId}/payments`, { method: "POST", body: JSON.stringify(body) })

export function listMemberPayments(memberId: number, offset: number, limit: number): Promise<PaymentPage> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) })
  return request<PaymentPage>(`/api/v1/members/${memberId}/payments?${params}`)
}
