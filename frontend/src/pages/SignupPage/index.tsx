import { type FormEvent, useState } from "react"
import Alert from "../../components/Alert"
import { useAuth } from "../../context/AuthContext"
import { Brand } from "../../layouts/AppLayout"
import { errorText } from "../../utils/text"

const EMPTY = { name: "", email: "", password: "", confirm: "" }
type Errors = Partial<Record<keyof typeof EMPTY, string>>

const FIELDS: { key: keyof typeof EMPTY; label: string; type: string; maxLength: number; autoComplete: string; hint?: string }[] = [
  { key: "name", label: "Full name", type: "text", maxLength: 100, autoComplete: "name" },
  { key: "email", label: "Email", type: "email", maxLength: 254, autoComplete: "email" },
  { key: "password", label: "Password", type: "password", maxLength: 128, autoComplete: "new-password", hint: "At least 8 characters." },
  { key: "confirm", label: "Confirm password", type: "password", maxLength: 128, autoComplete: "new-password" },
]

export default function SignupPage() {
  const { signup } = useAuth()
  const [form, setForm] = useState(EMPTY)
  const [fieldErrors, setFieldErrors] = useState<Errors>({})
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

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
    <main className="auth">
      <Brand />
      <section className="card">
        <h1>Create an account</h1>
        <form className="stack" onSubmit={handleSubmit} noValidate>
          {FIELDS.map((f, i) => (
            <div key={f.key} className="field">
              <label htmlFor={`signup-${f.key}`}>{f.label}</label>
              <input
                id={`signup-${f.key}`}
                type={f.type}
                value={form[f.key]}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                maxLength={f.maxLength}
                autoComplete={f.autoComplete}
                aria-invalid={!!fieldErrors[f.key]}
                autoFocus={i === 0}
              />
              {fieldErrors[f.key] ? <span className="field-error">{fieldErrors[f.key]}</span> : f.hint && <span className="hint">{f.hint}</span>}
            </div>
          ))}
          <Alert>{error}</Alert>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Creating account…" : "Sign up"}
          </button>
        </form>
        <p className="hint">
          Already have an account? <a href="#/login">Log in</a>
        </p>
      </section>
    </main>
  )
}
