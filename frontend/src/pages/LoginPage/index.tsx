import { type FormEvent, useState } from "react"
import Alert from "../../components/Alert"
import { useAuth } from "../../context/AuthContext"
import { Brand } from "../../layouts/AppLayout"
import { errorText } from "../../utils/text"

const ENDED = {
  expired: "Your session has ended. Log in again to continue.",
  banned: "This account has been banned. Contact the gym if you think this is a mistake.",
}

export default function LoginPage() {
  const { login, ended } = useAuth()
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
    <main className="auth">
      <Brand />
      <section className="card">
        <h1>Log in</h1>
        {!error && ended && <Alert kind={ended === "banned" ? "error" : "info"}>{ENDED[ended]}</Alert>}
        <form className="stack" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="login-email">Email</label>
            <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-invalid={!!fieldErrors.email} autoFocus />
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
              aria-invalid={!!fieldErrors.password}
            />
            {fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
          </div>
          <Alert>{error}</Alert>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Logging in…" : "Log in"}
          </button>
        </form>
        <p className="hint">
          New here? <a href="#/signup">Create an account</a>
        </p>
      </section>
    </main>
  )
}
