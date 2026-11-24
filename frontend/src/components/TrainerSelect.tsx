import { useEffect, useState } from "react"
import { listTrainers } from "../services/trainerService"
import type { Trainer } from "../types/gymClass"

interface Props {
  id: string
  label: string
  /** The chosen trainer's id, or "" for none. */
  value: string
  onChange: (value: string) => void
}

// Pick a personal trainer: an account with the Trainer role, or none.
export default function TrainerSelect({ id, label, value, onChange }: Props) {
  const [trainers, setTrainers] = useState<Trainer[]>([])

  useEffect(() => {
    let ignore = false
    listTrainers()
      .then((t) => !ignore && setTrainers(t))
      .catch(() => undefined) // the form still works, with no trainer to choose
    return () => {
      ignore = true
    }
  }, [])

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">None</option>
        {trainers.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  )
}
