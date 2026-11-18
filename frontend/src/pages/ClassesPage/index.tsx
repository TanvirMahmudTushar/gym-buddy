import { useEffect, useState } from "react"
import ClassForm from "../../components/ClassForm"
import ClassItem from "../../components/ClassItem"
import { createClass, listClasses } from "../../services/classService"
import type { ClassBody, GymClass } from "../../types/gymClass"
import { errorText } from "../../utils/member"

type Filter = "upcoming" | "all"

// Gym managers and admins: the class timetable. Add, edit and delete classes, and see who booked.
export default function ClassesPage() {
  const [classes, setClasses] = useState<GymClass[]>([])
  const [total, setTotal] = useState(0)
  const [filter, setFilter] = useState<Filter>("upcoming")
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState("")
  // Changing this remounts the add form, which clears it after a class is added.
  const [formKey, setFormKey] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let ignore = false
    setLoading(true)
    setError("")
    listClasses(0, filter === "upcoming")
      .then((page) => {
        if (ignore) return
        setClasses(page.items)
        setTotal(page.total)
      })
      .catch((err) => !ignore && setError(errorText(err)))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [filter, reloadKey])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const page = await listClasses(classes.length, filter === "upcoming")
      setClasses((prev) => [...prev, ...page.items])
      setTotal(page.total)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoadingMore(false)
    }
  }

  async function handleCreate(body: ClassBody) {
    setCreating(true)
    setCreateError("")
    try {
      await createClass(body)
      setFormKey((k) => k + 1)
      // Reload so the new class appears in its place in the list.
      setReloadKey((k) => k + 1)
    } catch (err) {
      setCreateError(errorText(err))
    } finally {
      setCreating(false)
    }
  }

  // An edit can change the start time, so reload to keep the list in order.
  const handleChanged = () => setReloadKey((k) => k + 1)
  const handleDeleted = (id: number) => {
    setClasses((prev) => prev.filter((c) => c.id !== id))
    setTotal((n) => n - 1)
  }

  let body
  if (loading && classes.length === 0) body = <p className="empty">Loading classes…</p>
  else if (error) body = <p className="error">{error}</p>
  else if (classes.length === 0)
    body = <p className="empty">{filter === "upcoming" ? "No upcoming classes. Add one above." : "No classes yet. Add the first one above."}</p>
  else
    body = (
      <ul className="class-list">
        {classes.map((c) => (
          <ClassItem key={c.id} gymClass={c} onChanged={handleChanged} onDeleted={handleDeleted} />
        ))}
      </ul>
    )

  return (
    <div className="column narrow-wide">
      <section className="card" aria-labelledby="add-class-heading">
        <h2 id="add-class-heading">Add class</h2>
        <ClassForm key={formKey} saving={creating} error={createError} onSave={handleCreate} />
      </section>
      <section className="card" aria-labelledby="classes-heading">
        <div className="toolbar">
          <h2 id="classes-heading">Classes</h2>
          <div className="chips" role="group" aria-label="Which classes to show">
            {(["upcoming", "all"] as const).map((f) => (
              <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === "upcoming" ? "Upcoming" : "All"}
              </button>
            ))}
          </div>
        </div>
        {body}
        {!loading && classes.length > 0 && (
          <div className="list-foot">
            <span>
              Showing {classes.length} of {total} {total === 1 ? "class" : "classes"}
            </span>
            {classes.length < total && (
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
