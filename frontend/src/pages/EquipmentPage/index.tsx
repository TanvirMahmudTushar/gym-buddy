import { useMemo, useState } from "react"
import EquipmentForm from "../../components/EquipmentForm"
import EquipmentItem from "../../components/EquipmentItem"
import Icon from "../../components/Icon"
import ListState from "../../components/ListState"
import Modal from "../../components/Modal"
import PageHeader from "../../components/PageHeader"
import Pager from "../../components/Pager"
import { useAuth } from "../../context/AuthContext"
import { useDebouncedValue } from "../../hooks/useDebouncedValue"
import { useHashValue } from "../../hooks/useHashValue"
import { usePagedList } from "../../hooks/usePagedList"
import { useSave } from "../../hooks/useSave"
import { createEquipment, listEquipment } from "../../services/equipmentService"
import type { EquipmentBody, EquipmentCategory, EquipmentFilters } from "../../types/equipment"
import { can } from "../../utils/auth"
import { CATEGORIES, SHOW, equipmentLink } from "../../utils/equipment"
import { hashParams } from "../../utils/hash"

/** The list named in the address (#/equipment?show=service_due), so the Dashboard can link to it. */
const showFromHash = (): EquipmentFilters["show"] => SHOW.find((s) => s.value === hashParams().get("show"))?.value ?? ""

// The gym's equipment: what works, what is broken and what needs a service. Trainers report faults; staff manage it.
export default function EquipmentPage() {
  const { user } = useAuth()
  const canManage = can(user, "equipment:manage")
  const show = useHashValue(showFromHash)
  const [category, setCategory] = useState<EquipmentCategory | "">("")
  const [search, setSearch] = useState("")
  const q = useDebouncedValue(search)
  const filters = useMemo<EquipmentFilters>(() => ({ show, category, q }), [show, category, q])
  const [reloadKey, setReloadKey] = useState(0)
  const reload = () => setReloadKey((k) => k + 1)
  const list = usePagedList(listEquipment, filters, reloadKey)
  const [adding, setAdding] = useState(false)
  const { saving, error, setError, run } = useSave()

  function close() {
    setAdding(false)
    setError("")
  }

  const add = (body: EquipmentBody) =>
    run(async () => {
      await createEquipment(body)
      close()
      reload()
    })

  const filtered = show !== "" || category !== "" || q !== ""
  return (
    <div className="page">
      <PageHeader title="Equipment" subtitle="What works, what is broken and what needs a service.">
        {canManage && (
          <button type="button" className="primary" onClick={() => setAdding(true)}>
            <Icon name="plus" /> Add equipment
          </button>
        )}
      </PageHeader>
      <div className="toolbar">
        <div className="chips" role="group" aria-label="Which equipment to show">
          {SHOW.map((s) => (
            <a key={s.value} className="chip" href={equipmentLink(s.value)} aria-current={show === s.value ? "true" : undefined}>
              {s.label}
            </a>
          ))}
        </div>
        <div className="filters">
          <div className="field">
            <input type="search" aria-label="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} maxLength={100} placeholder="Search name" autoComplete="off" />
          </div>
          <div className="field">
            <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value as EquipmentCategory | "")}>
              <option value="">Every category</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <ListState
        loading={list.loading}
        error={list.error}
        isEmpty={list.items.length === 0}
        empty={filtered ? "No equipment matches." : "No equipment is listed yet."}
      >
        <ul className="card-grid">
          {list.items.map((item) => (
            <EquipmentItem key={item.id} item={item} canManage={canManage} onChanged={reload} />
          ))}
        </ul>
        <Pager {...list} onChange={list.goTo} />
      </ListState>
      {adding && (
        <Modal title="Add equipment" onClose={close}>
          <EquipmentForm saving={saving} error={error} onSave={add} onCancel={close} />
        </Modal>
      )}
    </div>
  )
}
