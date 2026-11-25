import { type FormEvent, useState } from "react"
import type { Equipment, EquipmentBody, EquipmentCategory } from "../types/equipment"
import { CATEGORIES } from "../utils/equipment"
import { gymToday } from "../utils/time"
import FieldError from "./FieldError"
import FormActions from "./FormActions"

interface Props {
  /** The equipment being edited; leave out to add a new one. */
  item?: Equipment
  saving: boolean
  error: string
  onSave: (body: EquipmentBody) => void
  onCancel: () => void
}

type Errors = Partial<Record<"name" | "quantity" | "service", string>>

// One form for adding and editing equipment, with the same checks the API makes.
export default function EquipmentForm({ item, saving, error, onSave, onCancel }: Props) {
  const [form, setForm] = useState({
    name: item?.name ?? "",
    category: item?.category ?? ("cardio" as EquipmentCategory),
    quantity: String(item?.quantity ?? 1),
    purchased_on: item?.purchased_on ?? "",
    service_every_days: item?.service_every_days ? String(item.service_every_days) : "",
    last_serviced_on: item?.last_serviced_on ?? "",
    notes: item?.notes ?? "",
  })
  const [errors, setErrors] = useState<Errors>({})
  const today = gymToday()
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((prev) => ({ ...prev, [key]: e.target.value }))

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const quantity = Number(form.quantity)
    const service = form.service_every_days ? Number(form.service_every_days) : null
    const next: Errors = {}
    if (!form.name.trim()) next.name = "Enter a name."
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) next.quantity = "A whole number from 1 to 1,000."
    if (service !== null && (!Number.isInteger(service) || service < 1 || service > 3660)) next.service = "From 1 to 3,660 days, or empty."
    setErrors(next)
    if (Object.keys(next).length) return
    onSave({
      name: form.name.trim(),
      category: form.category,
      quantity,
      purchased_on: form.purchased_on || null,
      service_every_days: service,
      last_serviced_on: form.last_serviced_on || null,
      notes: form.notes.trim() || null,
    })
  }

  return (
    <form className="fields" onSubmit={handleSubmit} noValidate>
      <div className="field wide">
        <label htmlFor="equipment-name">Name</label>
        <input id="equipment-name" value={form.name} onChange={set("name")} maxLength={100} placeholder="Treadmill 1" autoComplete="off" autoFocus />
        <FieldError>{errors.name}</FieldError>
      </div>
      <div className="field">
        <label htmlFor="equipment-category">Category</label>
        <select id="equipment-category" value={form.category} onChange={set("category")}>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="equipment-quantity">How many</label>
        <input id="equipment-quantity" type="number" min={1} step={1} inputMode="numeric" value={form.quantity} onChange={set("quantity")} />
        <FieldError>{errors.quantity}</FieldError>
      </div>
      <div className="field">
        <label htmlFor="equipment-purchased">Bought on (optional)</label>
        <input id="equipment-purchased" type="date" max={today} value={form.purchased_on} onChange={set("purchased_on")} />
      </div>
      <div className="field">
        <label htmlFor="equipment-serviced">Last serviced (optional)</label>
        <input id="equipment-serviced" type="date" max={today} value={form.last_serviced_on} onChange={set("last_serviced_on")} />
      </div>
      <div className="field">
        <label htmlFor="equipment-service">Service every (days, optional)</label>
        <input id="equipment-service" type="number" min={1} step={1} inputMode="numeric" value={form.service_every_days} onChange={set("service_every_days")} placeholder="90" />
        <FieldError>{errors.service}</FieldError>
      </div>
      <div className="field wide">
        <label htmlFor="equipment-notes">Notes (optional)</label>
        <textarea id="equipment-notes" value={form.notes} onChange={set("notes")} maxLength={500} />
      </div>
      <FormActions label={item ? "Save changes" : "Add equipment"} saving={saving} error={error} onCancel={onCancel} />
    </form>
  )
}
