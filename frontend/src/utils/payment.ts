// Display helpers for money and payments. Amounts are whole taka (BDT).
import type { PaymentMethod } from "../types/payment"

export const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "mobile_banking", label: "Mobile banking" },
]

export const methodLabel = (method: PaymentMethod) => METHODS.find((m) => m.value === method)?.label ?? method

/** A negative amount (a month that cost more than it earned) keeps its sign in front: -৳500. */
export const formatMoney = (amount: number) => `${amount < 0 ? "-" : ""}৳${Math.abs(amount).toLocaleString("en-US")}`

/** The address of the Payments page filtered to these UTC days (YYYY-MM-DD), so a number elsewhere can link to its list. */
export function paymentsLink(from: string, to: string): string {
  return `#/payments?${new URLSearchParams({ from, to })}`
}

/** Hand a downloaded file to the browser's Save dialog. */
export function saveFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** A YYYY-MM-DD date plus a number of days, in UTC (the same calendar the API uses). */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
