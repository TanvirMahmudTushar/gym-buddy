import { useState } from "react"
import AnnouncementsCard from "../../components/AnnouncementsCard"
import ClassBookings from "../../components/ClassBookings"
import ClassSummary from "../../components/ClassSummary"
import ListState from "../../components/ListState"
import Modal from "../../components/Modal"
import PageHeader from "../../components/PageHeader"
import Pager from "../../components/Pager"
import { usePagedList } from "../../hooks/usePagedList"
import { listMyClasses } from "../../services/trainerService"
import type { BookingWhen, GymClass } from "../../types/gymClass"
import { formatClassTime } from "../../utils/time"

const PAGE_SIZE = 20

const load = (when: BookingWhen, offset: number) => listMyClasses(when, offset, PAGE_SIZE)

// Trainers: the classes they teach, who booked each one and who came.
export default function MyClassesPage() {
  const [when, setWhen] = useState<BookingWhen>("upcoming")
  const list = usePagedList(load, when)
  const [open, setOpen] = useState<GymClass | null>(null)

  return (
    <div className="page">
      <PageHeader title="My classes" subtitle="The classes you teach, who booked each one and who came." />
      <div className="chips" role="group" aria-label="Which classes to show">
        {(["upcoming", "past"] as const).map((w) => (
          <button key={w} type="button" className="chip" aria-pressed={when === w} onClick={() => setWhen(w)}>
            {w === "upcoming" ? "Upcoming" : "Past"}
          </button>
        ))}
      </div>
      <ListState
        loading={list.loading}
        error={list.error}
        isEmpty={list.items.length === 0}
        empty={when === "upcoming" ? "You have no upcoming classes. A Gym Manager picks the trainer for each class." : "No past classes yet."}
      >
        <ul className="card-grid">
          {list.items.map((c) => (
            <li key={c.id} className="item">
              <ClassSummary gymClass={c} showTrainer={false} />
              <div className="actions">
                <button type="button" className="small" onClick={() => setOpen(c)}>
                  Bookings and attendance
                </button>
              </div>
            </li>
          ))}
        </ul>
        <Pager {...list} onChange={list.goTo} />
      </ListState>
      <AnnouncementsCard />
      {open && (
        <Modal title={`${open.name}, ${formatClassTime(open.starts_at)}`} onClose={() => setOpen(null)}>
          <ClassBookings classId={open.id} startsAt={open.starts_at} linkMembers={false} />
        </Modal>
      )}
    </div>
  )
}
