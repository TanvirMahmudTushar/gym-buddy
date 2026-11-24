import { useEffect, useMemo, useState } from "react"
import EquipmentForm from "../../components/EquipmentForm"
import EquipmentItem from "../../components/EquipmentItem"
import { useAuth } from "../../context/AuthContext"
import { useDebouncedValue } from "../../hooks/useDebouncedValue"
import { usePagedList } from "../../hooks/usePagedList"
import { createEquipment, listEquipment } from "../../services/equipmentService"
import type { EquipmentBody, EquipmentCategory, EquipmentFilters } from "../../types/equipment"
import { can } from "../../utils/auth"
import { CATEGORIES, SHOW, equipmentLink } from "../../utils/equipment"
import { errorText, hashParams } from "../../utils/member"

/** The list named in the address (#/equipment?show=service_due), so the Dashboard can link to it. */
function showFromHash(): EquipmentFilters["show"] {
  const value = hashParams().get("show")
  return SHOW.find((s) => s.value === value)?.value ?? ""
}

// The gym's equipment: what works, what is broken and what needs a service. Trainers report faults; staff manage it.
export default function EquipmentPage() {
  const { user } = useAuth()
  const canManage = can(user, "equipment:manage")
  const [show, setShow] = useState(showFromHash)
  const [category, setCategory] = useState<EquipmentCategory | "">("")
  const [search, setSearch] = useState("")
  const q = useDebouncedValue(search)
  const filters = useMemo<EquipmentFilters>(() => ({ show, category, q }), [show, category, q])
  const [reloadKey, setReloadKey] = useState(0)
  const list = usePagedList(listEquipment, filters, reloadKey)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  // Changing this remounts the add form, which clears it after something is added.
  const [formKey, setFormKey] = useState(0)

  useEffect(() => {
    window.history.replaceState(null, "", equipmentLink(show))
  }, [show])

  async function add(body: EquipmentBody) {
    setSaving(true)
    setSaveError("")
    try {
      await createEquipment(body)
      setFormKey((k) => k + 1)
      setShow("")
      setCategory("")
      setSearch("")
      setReloadKey((k) => k + 1)
    } catch (err) {
      setSaveError(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  const filtered = show !== "" || category !== "" || q !== ""
  return (
    <div className="column narrow-wide">
      <section className="card" aria-labelledby="equipment-heading">
        <div className="toolbar">
          <h2 id="equipment-heading">Equipment {list.total > 0 && <span className="hint">({list.total})</span>}</h2>
          <div className="chips" role="group" aria-label="Which equipment to show">
            {SHOW.map((s) => (
              <button key={s.value} type="button" className="chip" aria-pressed={show === s.value} onClick={() => setShow(s.value)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="filters">
          <div className="field">
            <label htmlFor="equipment-q">Search</label>
            <input id="equipment-q" type="search" value={search} onChange={(e) => setSearch(e.target.value)} maxLength={100} placeholder="Name" autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="equipment-category">Category</label>
            <select id="equipment-category" value={category} onChange={(e) => setCategory(e.target.value as EquipmentCategory | "")}>
              <option value="">Any</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {list.error && (
          <p className="error" role="alert">
            {list.error}
          </p>
        )}
        {list.loading && list.items.length === 0 ? (
          <p className="empty">Loading equipment…</p>
        ) : list.items.length === 0 ? (
          !list.error && (
            <p className="empty">{filtered ? "No equipment matches." : canManage ? "No equipment yet. Add the first below." : "No equipment is listed yet."}</p>
          )
        ) : (
          <ul className="class-list">
            {list.items.map((item) => (
              <EquipmentItem key={item.id} item={item} canManage={canManage} onChanged={() => setReloadKey((k) => k + 1)} />
            ))}
          </ul>
        )}
        {list.items.length > 0 && (
          <div className="list-foot">
            <span>
              Showing {list.items.length} of {list.total}
            </span>
            {list.items.length < list.total && (
              <button onClick={list.loadMore} disabled={list.loadingMore}>
                {list.loadingMore ? "Loading…" : "Load more"}
              </button>
            )}
          </div>
        )}
      </section>
      {canManage && (
        <section className="card" aria-labelledby="add-equipment-heading">
          <h2 id="add-equipment-heading">Add equipment</h2>
          <EquipmentForm key={formKey} saving={saving} error={saveError} onSave={add} />
        </section>
      )}
    </div>
  )
}
