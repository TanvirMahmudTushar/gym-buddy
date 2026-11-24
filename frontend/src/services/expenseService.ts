// fetch helpers for expenses: /api/v1/expenses (admins only).
import type { Expense, ExpenseBody, ExpenseFilters, ExpensePage } from "../types/expense"
import { request, requestBlob } from "./api"

const BASE = "/api/v1/expenses"
const PAGE_SIZE = 20

/** Only the filters that are set go into the query string. The list and the CSV use the same ones. */
function filterParams(filters: ExpenseFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.date_from) params.set("date_from", filters.date_from)
  if (filters.date_to) params.set("date_to", filters.date_to)
  if (filters.category) params.set("category", filters.category)
  if (filters.q.trim()) params.set("q", filters.q.trim())
  return params
}

export function listExpenses(filters: ExpenseFilters, offset: number): Promise<ExpensePage> {
  const params = filterParams(filters)
  params.set("offset", String(offset))
  params.set("limit", String(PAGE_SIZE))
  return request<ExpensePage>(`${BASE}?${params}`)
}

export const createExpense = (body: ExpenseBody) => request<Expense>(BASE, { method: "POST", body: JSON.stringify(body) })

export const updateExpense = (id: number, body: ExpenseBody) =>
  request<Expense>(`${BASE}/${id}`, { method: "PATCH", body: JSON.stringify(body) })

/** Written to the activity log with what was deleted. */
export const deleteExpense = (id: number) => request<void>(`${BASE}/${id}`, { method: "DELETE" })

export const exportExpensesCsv = (filters: ExpenseFilters) => requestBlob(`${BASE}/export.csv?${filterParams(filters)}`)
