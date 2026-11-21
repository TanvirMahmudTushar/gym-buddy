import { type FormEvent, useState } from "react"
import { useAuth } from "../context/AuthContext"
import { changePassword } from "../services/authService"
import { errorText } from "../utils/member"

const EMPTY = { current: "", next: "", confirm: "" }

interface Props {
  heading?: string
  /** A paragraph above the form. */
  intro?: string
  /** The label of the first field, such as "Temporary password" after an admin reset. */
  currentLabel?: string
  /** Called after the password changed, for example to reload the session list. */
  onChanged?: () => void
}

// The server logs out every other browser; this one stays logged in.
export default function ChangePasswordForm({
  heading = "Change my password",
  intro,
  currentLabel = "Current password",
  onChanged,
}: Props) {
  const { user, setUser } = useAuth()
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof typeof EMPTY, string>>>({})
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const next: typeof errors = {}
    if (!form.current) next.current = `Enter your ${currentLabel.toLowerCase()}.`
    if (form.next.length < 8) next.next = "Use at least 8 characters."
    if (form.confirm !== form.next) next.confirm = "The passwords do not match."
    setErrors(next)
    setError("")
    if (Object.keys(next).length) return

    setBusy(true)
    setDone(false)
    try {
      await changePassword(form.current, form.next)
      setForm(EMPTY)
      // After an admin reset, choosing a password unlocks the rest of the app straight away.
      if (user?.must_change_password) {
        setUser({ ...user, must_change_password: false })
        return
      }
      setDone(true)
      onChanged?.()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card" aria-labelledby="password-heading">
      <h2 id="password-heading">{heading}</h2>
      {intro && <p className="hint">{intro}</p>}
      <form className="stack" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="pw-current">{currentLabel}</label>
          <input id="pw-current" type="password" value={form.current} onChange={set("current")} maxLength={128} autoComplete="current-password" />
          {errors.current && <span className="field-error">{errors.current}</span>}
        </div>
        <div className="field">
          <label htmlFor="pw-new">New password</label>
          <input id="pw-new" type="password" value={form.next} onChange={set("next")} maxLength={128} autoComplete="new-password" />
          {errors.next && <span className="field-error">{errors.next}</span>}
        </div>
        <div className="field">
          <label htmlFor="pw-confirm">Confirm new password</label>
          <input id="pw-confirm" type="password" value={form.confirm} onChange={set("confirm")} maxLength={128} autoComplete="new-password" />
          {errors.confirm && <span className="field-error">{errors.confirm}</span>}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {done && (
          <p className="hint" role="status">
            Password changed. You are still logged in here; every other browser has been logged out.
          </p>
        )}
        <div className="actions">
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Changing…" : "Change password"}
          </button>
        </div>
      </form>
    </section>
  )
}
