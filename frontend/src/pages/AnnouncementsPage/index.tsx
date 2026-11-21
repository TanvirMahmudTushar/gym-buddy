import { useEffect, useState } from "react"
import AnnouncementForm from "../../components/AnnouncementForm"
import AnnouncementItem from "../../components/AnnouncementItem"
import { createAnnouncement, listAnnouncements } from "../../services/announcementService"
import type { Announcement, AnnouncementBody } from "../../types/announcement"
import { errorText } from "../../utils/member"

const PAGE_SIZE = 20

type Filter = "current" | "all"

// Gym managers and admins: post, edit and delete the announcements members see on My membership.
export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [total, setTotal] = useState(0)
  const [filter, setFilter] = useState<Filter>("current")
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState("")
  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState("")
  // Changing this remounts the post form, which clears it after an announcement is posted.
  const [formKey, setFormKey] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)
  const includeEnded = filter === "all"

  useEffect(() => {
    let ignore = false
    setLoading(true)
    setError("")
    listAnnouncements(0, PAGE_SIZE, includeEnded)
      .then((page) => {
        if (ignore) return
        setAnnouncements(page.items)
        setTotal(page.total)
      })
      .catch((err) => !ignore && setError(errorText(err)))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [includeEnded, reloadKey])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const page = await listAnnouncements(announcements.length, PAGE_SIZE, includeEnded)
      setAnnouncements((prev) => [...prev, ...page.items])
      setTotal(page.total)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoadingMore(false)
    }
  }

  async function handlePost(body: AnnouncementBody) {
    setPosting(true)
    setPostError("")
    try {
      await createAnnouncement(body)
      setFormKey((k) => k + 1)
      // Reload so the new announcement shows at the top.
      setReloadKey((k) => k + 1)
    } catch (err) {
      setPostError(errorText(err))
    } finally {
      setPosting(false)
    }
  }

  // An edit can change the end date, which can move it in or out of the Current list, so reload.
  const handleChanged = () => setReloadKey((k) => k + 1)
  const handleDeleted = (id: number) => {
    setAnnouncements((prev) => prev.filter((a) => a.id !== id))
    setTotal((n) => n - 1)
  }

  let body
  if (loading && announcements.length === 0) body = <p className="empty">Loading announcements…</p>
  else if (error) body = <p className="error">{error}</p>
  else if (announcements.length === 0)
    body = <p className="empty">{includeEnded ? "No announcements yet. Post the first one above." : "Nothing is showing to members right now. Post an announcement above."}</p>
  else
    body = (
      <ul className="class-list">
        {announcements.map((a) => (
          <AnnouncementItem key={a.id} announcement={a} onChanged={handleChanged} onDeleted={handleDeleted} />
        ))}
      </ul>
    )

  return (
    <div className="column narrow-wide">
      <section className="card" aria-labelledby="post-announcement-heading">
        <h2 id="post-announcement-heading">Post announcement</h2>
        <AnnouncementForm key={formKey} saving={posting} error={postError} onSave={handlePost} />
      </section>
      <section className="card" aria-labelledby="announcements-list-heading">
        <div className="toolbar">
          <h2 id="announcements-list-heading">Announcements</h2>
          <div className="chips" role="group" aria-label="Which announcements to show">
            {(["current", "all"] as const).map((f) => (
              <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === "current" ? "Showing now" : "All, with ended"}
              </button>
            ))}
          </div>
        </div>
        {body}
        {!loading && announcements.length > 0 && (
          <div className="list-foot">
            <span>
              Showing {announcements.length} of {total} {total === 1 ? "announcement" : "announcements"}
            </span>
            {announcements.length < total && (
              <button onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
