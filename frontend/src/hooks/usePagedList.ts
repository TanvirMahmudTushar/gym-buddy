import { useEffect, useState } from "react"
import type { Page } from "../types/moderation"
import { errorText } from "../utils/member"

/** A list loaded a page at a time. It loads again from the start whenever `filters` (kept in state, so the same
 * object until it changes) or `reloadKey` changes; loadMore() appends the next page. */
export function usePagedList<T, F>(load: (filters: F, offset: number) => Promise<Page<T>>, filters: F, reloadKey = 0) {
  const [items, setItems] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let ignore = false
    setLoading(true)
    setError("")
    load(filters, 0)
      .then((page) => {
        if (ignore) return
        setItems(page.items)
        setTotal(page.total)
      })
      .catch((err) => !ignore && setError(errorText(err)))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [load, filters, reloadKey])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const page = await load(filters, items.length)
      setItems((prev) => [...prev, ...page.items])
      setTotal(page.total)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoadingMore(false)
    }
  }

  return { items, total, loading, loadingMore, error, loadMore }
}
