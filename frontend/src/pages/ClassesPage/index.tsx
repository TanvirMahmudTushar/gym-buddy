import { useEffect, useState } from "react"
import Alert from "../../components/Alert"
import ClassForm from "../../components/ClassForm"
import ClassItem from "../../components/ClassItem"
import Icon from "../../components/Icon"
import ListState from "../../components/ListState"
import Modal from "../../components/Modal"
import PageHeader from "../../components/PageHeader"
import Pager from "../../components/Pager"
import { usePagedList } from "../../hooks/usePagedList"
import { useSave } from "../../hooks/useSave"
import { createClass, listClasses } from "../../services/classService"
import { listTrainers } from "../../services/trainerService"
import type { ClassBody, Trainer } from "../../types/gymClass"
import { errorText } from "../../utils/text"

const load = (upcomingOnly: boolean, offset: number) => listClasses(offset, upcomingOnly)

// Gym managers and admins: the class timetable. Add, edit and delete classes, and see who booked.
export default function ClassesPage() {
  const [upcomingOnly, setUpcomingOnly] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = () => setReloadKey((k) => k + 1)
  const list = usePagedList(load, upcomingOnly, reloadKey)
  const [adding, setAdding] = useState(false)
  const { saving, error, setError, run } = useSave()
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [trainersError, setTrainersError] = useState("")

  // The trainer choices for the add and edit forms, loaded once.
  useEffect(() => {
    let ignore = false
    listTrainers()
      .then((found) => !ignore && setTrainers(found))
      .catch((err) => !ignore && setTrainersError(`Could not load the trainers: ${errorText(err)}`))
    return () => {
      ignore = true
    }
  }, [])

  function close() {
    setAdding(false)
    setError("")
  }

  const add = (body: ClassBody) =>
    run(async () => {
      await createClass(body)
      close()
      reload()
    })

  return (
    <div className="page">
      <PageHeader title="Classes" subtitle="The timetable members book from.">
        <button type="button" className="primary" onClick={() => setAdding(true)}>
          <Icon name="plus" /> Add class
        </button>
      </PageHeader>
      <div className="chips" role="group" aria-label="Which classes to show">
        <button type="button" className="chip" aria-pressed={upcomingOnly} onClick={() => setUpcomingOnly(true)}>
          Upcoming
        </button>
        <button type="button" className="chip" aria-pressed={!upcomingOnly} onClick={() => setUpcomingOnly(false)}>
          All, with past
        </button>
      </div>
      <Alert>{trainersError}</Alert>
      <ListState loading={list.loading} error={list.error} isEmpty={list.items.length === 0} empty={upcomingOnly ? "No upcoming classes." : "No classes yet."}>
        <ul className="card-grid">
          {list.items.map((c) => (
            <ClassItem key={c.id} gymClass={c} trainers={trainers} onChanged={reload} />
          ))}
        </ul>
        <Pager {...list} onChange={list.goTo} />
      </ListState>
      {adding && (
        <Modal title="Add a class" onClose={close}>
          <ClassForm trainers={trainers} saving={saving} error={error} onSave={add} onCancel={close} />
        </Modal>
      )}
    </div>
  )
}
