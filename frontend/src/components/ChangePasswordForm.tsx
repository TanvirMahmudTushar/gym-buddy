import { type FormEvent, useEffect, useRef, useState } from "react"
import { useAuth } from "../context/AuthContext"
import { changePassword } from "../services/authService"
import { errorText } from "../utils/member"

const EMPTY = { current: "", next: "", confirm: "" }

// Every login made before the change stops working, so the person is logged out and signs in with the new password.
export default function ChangePasswordForm() {
  const { logout } = useAuth()
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof typeof EMPTY, string>>>({})
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const next: typeof errors = {}
    if (!form.current) next.current = "Enter your current password."
    if (form.next.length < 8) next.next = "Use at least 8 characters."
    if (form.confirm !== form.next) next.confirm = "The passwords do not match."
    setErrors(next)
    setError("")
    if (Object.keys(next).length) return

    setBusy(true)
    try {
      await changePassword(form.current, form.next)
      setDone(true)
      setForm(EMPTY)
      timer.current = window.setTimeout(logout, 2500)
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <section className="card" aria-labelledby="password-heading">
      <h2 id="password-heading">Change my password</h2>
      <form className="stack" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="pw-current">Current password</label>
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
            Password changed. You will be logged out now; log in with the new password.
          </p>
        )}
        <div className="actions">
          <button className="primary" type="submit" disabled={busy}>
            {busy && !done ? "Changing…" : "Change password"}
          </button>
        </div>
      </form>
    </section>
  )
}
