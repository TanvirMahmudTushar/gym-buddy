import { type FormEvent, useState } from "react"
import { useAuth } from "../../context/AuthContext"
import { errorText } from "../../utils/member"

export default function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const errors: typeof fieldErrors = {}
    if (!email.trim()) errors.email = "Enter your email."
    if (!password) errors.password = "Enter your password."
    setFieldErrors(errors)
    setError("")
    if (Object.keys(errors).length) return

    setBusy(true)
    try {
      // On success the app sees the user and moves on by itself.
      await login(email.trim(), password)
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <section className="card auth-card" aria-labelledby="login-heading">
      <h2 id="login-heading">Log in</h2>
      <form className="stack" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
          />
          {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
        </div>
        <div className="field">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={128}
            autoComplete="current-password"
          />
          {fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>
      <p className="hint">
        New here? <a href="#/signup">Create an account</a>
      </p>
    </section>
  )
}
