import { useEffect, useState } from "react"
import type { Page } from "../types/page"
import { errorText } from "../utils/text"

/** A list shown a page at a time (with the Pager component). It goes back to the first page whenever `filters` (kept in
 * state, so the same object until it changes) changes, and loads the page again when `reloadKey` changes. */
export function usePagedList<F, P extends Page<unknown>>(
  load: (filters: F, offset: number) => Promise<P>,
  filters: F,
  reloadKey = 0,
) {
  type Item = P["items"][number]
  const [data, setData] = useState<P | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  // Where the list is, for these filters. New filters start from 0 again.
  const [position, setPosition] = useState({ filters, offset: 0 })
  const offset = position.filters === filters ? position.offset : 0

  useEffect(() => {
    let ignore = false
    setLoading(true)
    setError("")
    load(filters, offset)
      .then((page) => {
        if (ignore) return
        // The last row of the last page was deleted: show the page before it.
        if (page.items.length === 0 && page.total > 0 && offset > 0) {
          setPosition({ filters, offset: Math.floor((page.total - 1) / page.limit) * page.limit })
          return
        }
        setData(page)
      })
      .catch((err) => !ignore && setError(errorText(err)))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [load, filters, offset, reloadKey])

  return {
    /** The whole page, for extra fields such as a total amount; null until the first one has loaded. */
    data,
    items: (data?.items ?? []) as Item[],
    total: data?.total ?? 0,
    offset,
    limit: data?.limit ?? 20,
    loading,
    error,
    goTo: (next: number) => setPosition({ filters, offset: next }),
    /** Replace the rows of this page after one was changed, without loading it again. */
    replace: (change: (items: Item[]) => Item[]) => setData((prev) => prev && { ...prev, items: change(prev.items as Item[]) }),
  }
}
