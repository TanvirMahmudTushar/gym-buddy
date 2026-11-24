import { useEffect, useRef, useState } from "react"
import { useDebouncedValue } from "../hooks/useDebouncedValue"
import { listWaiting } from "../services/memberService"
import type { User } from "../types/auth"
import { errorText, formatDate } from "../utils/member"

const PAGE_SIZE = 5

interface Props {
  /** Bumped after a membership is started, so that person leaves the list. */
  refreshKey: number
  /** Fill the Add member form with this account's email. */
  onStart: (email: string) => void
  /** Scroll this card into view when the page opens (the Dashboard's Waiting number links here). */
  scrollOnOpen?: boolean
}

// People who signed up but have no membership yet: the front desk starts one with a click instead of typing the email.
export default function WaitingList({ refreshKey, onStart, scrollOnOpen = false }: Props) {
  const section = useRef<HTMLElement>(null)
  useEffect(() => {
    if (scrollOnOpen) section.current?.scrollIntoView({ block: "start" })
  }, [scrollOnOpen])
  const [accounts, setAccounts] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState("")
  const query = useDebouncedValue(search)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let ignore = false
    setLoading(true)
    setError("")
    listWaiting(0, PAGE_SIZE, query)
      .then((page) => {
        if (ignore) return
        setAccounts(page.items)
        setTotal(page.total)
      })
      .catch((err) => !ignore && setError(errorText(err)))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [query, refreshKey])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const page = await listWaiting(accounts.length, PAGE_SIZE, query)
      setAccounts((prev) => [...prev, ...page.items])
      setTotal(page.total)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoadingMore(false)
    }
  }

  let body
  if (loading && accounts.length === 0) body = <p className="empty">Loading…</p>
  else if (error) body = <p className="error">{error}</p>
  else if (accounts.length === 0)
    body = <p className="empty">{query ? `Nobody waiting matches "${query}".` : "Nobody is waiting for a membership."}</p>
  else
    body = (
      <ul className="visit-list">
        {accounts.map((a) => (
          <li key={a.id}>
            <span className="wrap-text">
              <strong>{a.name}</strong> <span className="hint">· {a.email} · signed up {formatDate(a.created_at)}</span>
            </span>
            <button type="button" onClick={() => onStart(a.email)}>
              Start membership
            </button>
          </li>
        ))}
      </ul>
    )

  return (
    <section className="card" aria-labelledby="waiting-heading" ref={section}>
      <div className="toolbar">
        <h2 id="waiting-heading">
          Waiting for a membership {total > 0 && <span className="hint">({total})</span>}
        </h2>
        <input
          type="search"
          className="search"
          aria-label="Search people waiting by name or email"
          placeholder="Search name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          maxLength={100}
        />
      </div>
      <p className="hint">People who signed up in the app but have no membership yet.</p>
      {body}
      {accounts.length < total && (
        <button type="button" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? "Loading…" : "Show more"}
        </button>
      )}
    </section>
  )
}
