// Display helpers for money and payments. Amounts are whole taka (BDT).
import type { PaymentMethod } from "../types/payment"

export const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "mobile_banking", label: "Mobile banking" },
]

export const methodLabel = (method: PaymentMethod) => METHODS.find((m) => m.value === method)?.label ?? method

export const formatMoney = (amount: number) => `৳${amount.toLocaleString("en-US")}`

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
