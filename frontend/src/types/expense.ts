// Expense types matching the FastAPI schemas (TDD 5.3).
import type { Page } from "./page"

export type ExpenseCategory = "rent" | "salaries" | "utilities" | "equipment" | "maintenance" | "marketing" | "other"

export interface Expense {
  id: number
  category: ExpenseCategory
  /** Whole taka. */
  amount: number
  /** YYYY-MM-DD */
  spent_on: string
  description: string | null
  recorded_by_name: string | null
}

export interface ExpenseBody {
  category: ExpenseCategory
  amount: number
  spent_on: string
  description: string | null
}

export interface ExpensePage extends Page<Expense> {
  /** The sum of every matching expense, not just this page. */
  total_amount: number
}

/** Empty strings mean any. Dates are YYYY-MM-DD, both included. */
export interface ExpenseFilters {
  date_from: string
  date_to: string
  category: ExpenseCategory | ""
  q: string
}
