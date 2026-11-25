import { useEffect, useState } from "react"
import { listTrainers } from "../services/trainerService"
import type { Trainer } from "../types/gymClass"

interface Props {
  id: string
  /** The chosen trainer's id, or "" for none. */
  value: string
  /** The name of the trainer chosen now, so it stays a choice even if the list does not have them (any more). */
  currentName?: string | null
  onChange: (value: string) => void
}

// Pick a personal trainer: an account with the Trainer role, or none.
export default function TrainerSelect({ id, value, currentName, onChange }: Props) {
  const [trainers, setTrainers] = useState<Trainer[]>([])

  useEffect(() => {
    let ignore = false
    listTrainers()
      .then((t) => !ignore && setTrainers(t))
      .catch(() => undefined) // the form still works, with no other trainer to choose
    return () => {
      ignore = true
    }
  }, [])

  return (
    <div className="field">
      <label htmlFor={id}>Personal trainer (optional)</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">None</option>
        {value && !trainers.some((t) => String(t.id) === value) && <option value={value}>{currentName ?? "Current trainer"}</option>}
        {trainers.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  )
}
