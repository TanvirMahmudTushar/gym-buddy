import { type FormEvent, useState } from "react"
import { useAuth } from "../../context/AuthContext"
import { errorText } from "../../utils/member"

const EMPTY = { name: "", email: "", password: "", confirm: "" }
type Errors = Partial<Record<keyof typeof EMPTY, string>>

export default function SignupPage() {
  const { signup } = useAuth()
  const [form, setForm] = useState(EMPTY)
  const [fieldErrors, setFieldErrors] = useState<Errors>({})
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const errors: Errors = {}
    if (!form.name.trim()) errors.name = "Enter your name."
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errors.email = "Enter a valid email."
    if (form.password.length < 8) errors.password = "Use at least 8 characters."
    if (form.confirm !== form.password) errors.confirm = "The passwords do not match."
    setFieldErrors(errors)
    setError("")
    if (Object.keys(errors).length) return

    setBusy(true)
    try {
      // Creates the account and logs in; the app then moves on by itself.
      await signup({ name: form.name.trim(), email: form.email.trim(), password: form.password })
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <section className="card auth-card" aria-labelledby="signup-heading">
      <h2 id="signup-heading">Create an account</h2>
      <form className="stack" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="signup-name">Full name</label>
          <input
            id="signup-name"
            value={form.name}
            onChange={set("name")}
            maxLength={100}
            autoComplete="name"
            autoFocus
          />
          {fieldErrors.name && <span className="field-error">{fieldErrors.name}</span>}
        </div>
        <div className="field">
          <label htmlFor="signup-email">Email</label>
          <input id="signup-email" type="email" value={form.email} onChange={set("email")} autoComplete="email" />
          {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
        </div>
        <div className="field">
          <label htmlFor="signup-password">Password</label>
          <input
            id="signup-password"
            type="password"
            value={form.password}
            onChange={set("password")}
            maxLength={128}
            autoComplete="new-password"
          />
          {fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
        </div>
        <div className="field">
          <label htmlFor="signup-confirm">Confirm password</label>
          <input
            id="signup-confirm"
            type="password"
            value={form.confirm}
            onChange={set("confirm")}
            maxLength={128}
            autoComplete="new-password"
          />
          {fieldErrors.confirm && <span className="field-error">{fieldErrors.confirm}</span>}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Creating account…" : "Sign up"}
        </button>
      </form>
      <p className="hint">New accounts start as a User. An admin can give you more access later.</p>
      <p className="hint">
        Already have an account? <a href="#/login">Log in</a>
      </p>
    </section>
  )
}
