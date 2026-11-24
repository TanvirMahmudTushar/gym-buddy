// Display helpers for expenses.
import type { ExpenseCategory } from "../types/expense"

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: "rent", label: "Rent" },
  { value: "salaries", label: "Salaries" },
  { value: "utilities", label: "Utilities" },
  { value: "equipment", label: "Equipment" },
  { value: "maintenance", label: "Maintenance" },
  { value: "marketing", label: "Marketing" },
  { value: "other", label: "Other" },
]

export const expenseLabel = (category: ExpenseCategory) => EXPENSE_CATEGORIES.find((c) => c.value === category)?.label ?? category
