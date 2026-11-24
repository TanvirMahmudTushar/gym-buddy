import { type ReactNode, useEffect, useState } from "react"
import { listAnnouncements } from "../services/announcementService"
import type { Announcement } from "../types/announcement"
import { postedNote } from "../utils/announcement"
import { errorText, formatDate } from "../utils/member"

const PAGE_SIZE = 5

interface Props {
  /** Show nothing at all while loading or when there are no current announcements (the member's page). */
  hideWhenEmpty?: boolean
  emptyText?: string
  footer?: ReactNode
  /** Changing this loads the list again, such as when the page's Refresh button is pressed. */
  refreshKey?: number
}

// The current announcements, newest first, for anyone to read: on My membership, My classes and the Dashboard.
export default function AnnouncementsCard({ hideWhenEmpty = false, emptyText = "No announcements right now.", footer, refreshKey = 0 }: Props) {
  const [items, setItems] = useState<Announcement[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let ignore = false
    setLoading(true)
    setError("")
    listAnnouncements(0, PAGE_SIZE)
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
  }, [refreshKey])

  async function showMore() {
    setLoadingMore(true)
    try {
      const page = await listAnnouncements(items.length, PAGE_SIZE)
      setItems((prev) => [...prev, ...page.items])
      setTotal(page.total)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoadingMore(false)
    }
  }

  if (hideWhenEmpty && !error && (loading || items.length === 0)) return null

  let body
  if (loading && items.length === 0) body = <p className="empty">Loading announcements…</p>
  else if (items.length === 0 && !error) body = <p className="empty">{emptyText}</p>
  else
    body = (
      <ul className="class-list">
        {items.map((a) => (
          <li key={a.id} className="class-item">
            <h3 className="wrap-text">{a.title}</h3>
            <p className="announcement-message">{a.message}</p>
            <p className="hint">
              {postedNote(a)}
              {a.ends_on && ` · until ${formatDate(a.ends_on)}`}
            </p>
          </li>
        ))}
      </ul>
    )

  return (
    <section className="card" aria-labelledby="announcements-heading">
      <h2 id="announcements-heading">Announcements {total > 0 && <span className="hint">({total})</span>}</h2>
      {error && (
        <p className="error" role="alert">
          Could not load the announcements: {error}
        </p>
      )}
      {body}
      {items.length < total && (
        <button type="button" onClick={showMore} disabled={loadingMore}>
          {loadingMore ? "Loading…" : "Show older announcements"}
        </button>
      )}
      {footer}
    </section>
  )
}
