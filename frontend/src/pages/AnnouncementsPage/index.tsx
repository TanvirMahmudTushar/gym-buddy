import { useState } from "react"
import AnnouncementForm from "../../components/AnnouncementForm"
import AnnouncementItem from "../../components/AnnouncementItem"
import Icon from "../../components/Icon"
import ListState from "../../components/ListState"
import Modal from "../../components/Modal"
import PageHeader from "../../components/PageHeader"
import Pager from "../../components/Pager"
import { usePagedList } from "../../hooks/usePagedList"
import { useSave } from "../../hooks/useSave"
import { createAnnouncement, listAnnouncements } from "../../services/announcementService"
import type { AnnouncementBody } from "../../types/announcement"

const PAGE_SIZE = 20

const load = (includeEnded: boolean, offset: number) => listAnnouncements(offset, PAGE_SIZE, includeEnded)

// Gym managers and admins: post, edit and delete the announcements everyone sees.
export default function AnnouncementsPage() {
  const [includeEnded, setIncludeEnded] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = () => setReloadKey((k) => k + 1)
  const list = usePagedList(load, includeEnded, reloadKey)
  const [posting, setPosting] = useState(false)
  const { saving, error, setError, run } = useSave()

  function close() {
    setPosting(false)
    setError("")
  }

  const post = (body: AnnouncementBody) =>
    run(async () => {
      await createAnnouncement(body)
      close()
      reload()
    })

  return (
    <div className="page">
      <PageHeader title="Announcements" subtitle="News from the gym. Members see it on My membership, trainers on My classes, staff on the Dashboard.">
        <button type="button" className="primary" onClick={() => setPosting(true)}>
          <Icon name="plus" /> Post announcement
        </button>
      </PageHeader>
      <div className="chips" role="group" aria-label="Which announcements to show">
        <button type="button" className="chip" aria-pressed={!includeEnded} onClick={() => setIncludeEnded(false)}>
          Showing now
        </button>
        <button type="button" className="chip" aria-pressed={includeEnded} onClick={() => setIncludeEnded(true)}>
          All, with ended
        </button>
      </div>
      <ListState
        loading={list.loading}
        error={list.error}
        isEmpty={list.items.length === 0}
        empty={includeEnded ? "No announcements yet. Post the first one." : "Nothing is showing right now."}
      >
        <ul className="card-grid">
          {list.items.map((a) => (
            <AnnouncementItem key={a.id} announcement={a} onChanged={reload} />
          ))}
        </ul>
        <Pager {...list} onChange={list.goTo} />
      </ListState>
      {posting && (
        <Modal title="Post an announcement" onClose={close}>
          <AnnouncementForm saving={saving} error={error} onSave={post} onCancel={close} />
        </Modal>
      )}
    </div>
  )
}
