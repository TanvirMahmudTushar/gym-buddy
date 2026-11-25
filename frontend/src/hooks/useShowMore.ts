import { useEffect, useState } from "react"
import type { Page } from "../types/page"
import { errorText } from "../utils/text"

/** A short list inside a card that grows with a "Show more" button. `load` is fixed for the life of the component (the
 * parent remounts it with a key); `reloadKey` starts the list again. */
export function useShowMore<T>(load: (offset: number) => Promise<Page<T>>, reloadKey: unknown = 0) {
  const [items, setItems] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let ignore = false
    setLoading(true)
    setError("")
    load(0)
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
    // `load` is not watched: see above.
  }, [reloadKey])

  async function showMore() {
    setLoadingMore(true)
    try {
      const page = await load(items.length)
      setItems((prev) => [...prev, ...page.items])
      setTotal(page.total)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoadingMore(false)
    }
  }

  return { items, total, loading, loadingMore, error, showMore, setItems, setTotal }
}
