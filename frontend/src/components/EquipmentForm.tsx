import { type FormEvent, useState } from "react"
import type { Equipment, EquipmentBody, EquipmentCategory } from "../types/equipment"
import { CATEGORIES } from "../utils/equipment"
import { todayUtc } from "../utils/member"

interface Props {
  /** The equipment being edited; leave out to add a new one. */
  item?: Equipment
  saving: boolean
  error: string
  onSave: (body: EquipmentBody) => void
  onCancel?: () => void
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
  const id = item ? `equipment-${item.id}` : "add-equipment"
  const today = todayUtc()
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((prev) => ({ ...prev, [key]: e.target.value }))

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const quantity = Number(form.quantity)
    const service = form.service_every_days ? Number(form.service_every_days) : null
    const next: Errors = {}
    if (!form.name.trim()) next.name = "Enter a name."
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) next.quantity = "A whole number from 1 to 1,000."
    if (service !== null && (!Number.isInteger(service) || service < 1 || service > 3660)) next.service = "A whole number of days from 1 to 3,660, or empty."
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
      <div className="field">
        <label htmlFor={`${id}-name`}>Name</label>
        <input id={`${id}-name`} value={form.name} onChange={set("name")} maxLength={100} placeholder="Treadmill 1" autoComplete="off" />
        {errors.name && <span className="field-error">{errors.name}</span>}
      </div>
      <div className="field">
        <label htmlFor={`${id}-category`}>Category</label>
        <select id={`${id}-category`} value={form.category} onChange={set("category")}>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${id}-quantity`}>How many</label>
        <input id={`${id}-quantity`} type="number" min={1} step={1} inputMode="numeric" value={form.quantity} onChange={set("quantity")} />
        {errors.quantity && <span className="field-error">{errors.quantity}</span>}
      </div>
      <div className="field">
        <label htmlFor={`${id}-purchased`}>Bought on (optional)</label>
        <input id={`${id}-purchased`} type="date" max={today} value={form.purchased_on} onChange={set("purchased_on")} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-service`}>Service every (days, optional)</label>
        <input id={`${id}-service`} type="number" min={1} step={1} inputMode="numeric" value={form.service_every_days} onChange={set("service_every_days")} placeholder="90" />
        {errors.service && <span className="field-error">{errors.service}</span>}
      </div>
      <div className="field">
        <label htmlFor={`${id}-serviced`}>Last serviced (optional)</label>
        <input id={`${id}-serviced`} type="date" max={today} value={form.last_serviced_on} onChange={set("last_serviced_on")} />
      </div>
      <div className="field wide">
        <label htmlFor={`${id}-notes`}>Notes (optional)</label>
        <textarea id={`${id}-notes`} value={form.notes} onChange={set("notes")} maxLength={500} />
      </div>
      <div className="field wide actions">
        <button className="primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : item ? "Save changes" : "Add equipment"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
      </div>
      {error && (
        <p className="error wide-error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
