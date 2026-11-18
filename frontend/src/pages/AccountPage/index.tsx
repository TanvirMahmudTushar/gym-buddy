import { type FormEvent, useState } from "react"
import { useAuth } from "../../context/AuthContext"
import { renameMe } from "../../services/authService"
import { ROLES, canOpen, roleLabel } from "../../utils/auth"
import { errorText, formatDate } from "../../utils/member"

// Every logged-in person sees this page: their details and their role.
export default function AccountPage() {
  const { user, setUser } = useAuth()
  const [name, setName] = useState(user?.name ?? "")
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!user) return null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaved(false)
    if (!name.trim()) {
      setError("Enter your name.")
      return
    }
    setError("")
    setBusy(true)
    try {
      setUser(await renameMe(name.trim()))
      setSaved(true)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const description = ROLES.find((r) => r.value === user.role)?.description

  return (
    <div className="column narrow">
      <section className="card" aria-labelledby="account-heading">
        <h2 id="account-heading">My account</h2>
        <dl className="facts">
          <dt>Email</dt>
          <dd>{user.email}</dd>
          <dt>Role</dt>
          <dd>
            <span className={`pill role-${user.role}`}>{roleLabel(user.role)}</span>
          </dd>
          <dt>Member since</dt>
          <dd>{formatDate(user.created_at)}</dd>
        </dl>
        <p className="hint">{description}</p>
        {!canOpen(user.role, "members") && (
          <p className="hint">To manage gym members, ask an admin to make you a Gym Manager, then log in again.</p>
        )}
      </section>
      <section className="card" aria-labelledby="name-heading">
        <h2 id="name-heading">Change my name</h2>
        <form className="stack" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="account-name">Full name</label>
            <input
              id="account-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setSaved(false)
              }}
              maxLength={100}
              autoComplete="name"
            />
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="actions">
            <button className="primary" type="submit" disabled={busy || name.trim() === user.name}>
              {busy ? "Saving…" : "Save name"}
            </button>
            {saved && <span className="hint">Saved.</span>}
          </div>
        </form>
      </section>
    </div>
  )
}
