import { useState } from "react"

/** The ticked rows of a list. Only rows on screen can be ticked, so nothing hidden is ever changed or deleted. */
export function useSelection(shownIds: number[]) {
  const [ticked, setTicked] = useState<number[]>([])
  const ids = ticked.filter((id) => shownIds.includes(id))
  const all = shownIds.length > 0 && ids.length === shownIds.length
  return {
    ids,
    has: (id: number) => ids.includes(id),
    toggle: (id: number) => setTicked(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]),
    all,
    some: ids.length > 0 && !all,
    toggleAll: () => setTicked(all ? [] : shownIds),
    clear: () => setTicked([]),
  }
}

export type Selection = ReturnType<typeof useSelection>
