import { useShowMore } from "../hooks/useShowMore"
import { listAnnouncements } from "../services/announcementService"
import type { Announcement } from "../types/announcement"
import { postedNote } from "../utils/announcement"
import ListState from "./ListState"
import ShowMore from "./ShowMore"

const PAGE_SIZE = 3

interface Props {
  /** A link to the page where staff post and edit them. */
  manageLink?: boolean
  /** Changing this loads the list again, such as when the page's Refresh button is pressed. */
  refreshKey?: number
}

// The current announcements, newest first, for anyone to read: on My membership, My classes and the Dashboard.
export default function AnnouncementsCard({ manageLink = false, refreshKey = 0 }: Props) {
  const list = useShowMore<Announcement>((offset) => listAnnouncements(offset, PAGE_SIZE), refreshKey)
  return (
    <section className="card">
      <div className="toolbar">
        <h2>Announcements</h2>
        {manageLink && <a href="#/announcements">All announcements</a>}
      </div>
      <ListState loading={list.loading} error={list.error} isEmpty={list.items.length === 0} empty="No announcements right now.">
        <ul className="rows">
          {list.items.map((a) => (
            <li key={a.id}>
              <div className="stack">
                <div>
                  <span className="row-title">{a.title}</span>
                  <p className="prose">{a.message}</p>
                </div>
                <span className="hint">{postedNote(a)}</span>
              </div>
            </li>
          ))}
        </ul>
      </ListState>
      <ShowMore shown={list.items.length} total={list.total} loading={list.loadingMore} onClick={list.showMore} />
    </section>
  )
}
