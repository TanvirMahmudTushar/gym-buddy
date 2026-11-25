import { type FormEvent, useState } from "react"
import { useAuth } from "../context/AuthContext"
import { useSave } from "../hooks/useSave"
import { changePassword } from "../services/authService"
import Alert from "./Alert"
import FieldError from "./FieldError"

const EMPTY = { current: "", next: "", confirm: "" }

interface Props {
  /** The label of the first field, such as "Temporary password" after an admin reset. */
  currentLabel?: string
  /** Called after the password changed, for example to reload the session list. */
  onChanged?: () => void
}

// The server logs out every other browser; this one stays logged in.
export default function ChangePasswordForm({ currentLabel = "Current password", onChanged }: Props) {
  const { user, setUser } = useAuth()
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof typeof EMPTY, string>>>({})
  const [done, setDone] = useState(false)
  const { saving, error, run } = useSave()

  const field = (key: keyof typeof EMPTY, label: string, autoComplete: string) => (
    <div className="field">
      <label htmlFor={`pw-${key}`}>{label}</label>
      <input
        id={`pw-${key}`}
        type="password"
        value={form[key]}
        onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
        maxLength={128}
        autoComplete={autoComplete}
        aria-invalid={!!errors[key]}
      />
      <FieldError>{errors[key]}</FieldError>
    </div>
  )

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const next: typeof errors = {}
    if (!form.current) next.current = `Enter your ${currentLabel.toLowerCase()}.`
    if (form.next.length < 8) next.next = "Use at least 8 characters."
    else if (form.next === form.current) next.next = "Choose a password different from the current one."
    if (form.confirm !== form.next) next.confirm = "The passwords do not match."
    setErrors(next)
    setDone(false)
    if (Object.keys(next).length) return

    void run(async () => {
      await changePassword(form.current, form.next)
      setForm(EMPTY)
      // After an admin reset, choosing a password unlocks the rest of the app straight away.
      if (user?.must_change_password) setUser({ ...user, must_change_password: false })
      setDone(true)
      onChanged?.()
    })
  }

  return (
    <form className="stack" onSubmit={handleSubmit} noValidate>
      {field("current", currentLabel, "current-password")}
      {field("next", "New password (at least 8 characters)", "new-password")}
      {field("confirm", "Confirm new password", "new-password")}
      <Alert>{error}</Alert>
      <Alert kind="success">{done && "Password changed. Every other browser has been logged out."}</Alert>
      <div className="actions">
        <button className="primary" type="submit" disabled={saving}>
          {saving ? "Changing…" : "Change password"}
        </button>
      </div>
    </form>
  )
}
