import { type FormEvent, useState } from "react"
import Alert from "../../components/Alert"
import ChangePasswordForm from "../../components/ChangePasswordForm"
import MyDetailsCard from "../../components/MyDetailsCard"
import PageHeader from "../../components/PageHeader"
import RolePill from "../../components/RolePill"
import SessionsCard from "../../components/SessionsCard"
import { useAuth } from "../../context/AuthContext"
import { useSave } from "../../hooks/useSave"
import { renameMe } from "../../services/authService"
import { ROLES } from "../../utils/auth"
import { formatDate } from "../../utils/time"

// Every logged-in person sees this page: their profile, password and sessions.
export default function AccountPage() {
  const { user, setUser } = useAuth()
  const [name, setName] = useState(user?.name ?? "")
  const [saved, setSaved] = useState(false)
  const { saving, error, setError, run } = useSave()
  // Bumped after a password change, which logs the other browsers out, so the session list shows that.
  const [sessionsKey, setSessionsKey] = useState(0)

  if (!user) return null

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaved(false)
    if (!name.trim()) return setError("Enter your name.")
    void run(async () => {
      setUser(await renameMe(name.trim()))
      setSaved(true)
    })
  }

  return (
    <div className="page">
      <PageHeader title="My account" subtitle={user.email} />
      <div className="split">
        <div className="column">
          <section className="card">
            <h2>Profile</h2>
            <form className="stack" onSubmit={handleSubmit} noValidate>
              <div className="inline">
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
                <button className="primary" type="submit" disabled={saving || name.trim() === user.name}>
                  {saving ? "Saving…" : "Save name"}
                </button>
              </div>
              <Alert>{error}</Alert>
              <Alert kind="success">{saved && "Your name is saved."}</Alert>
            </form>
            <dl className="facts">
              <dt>Role</dt>
              <dd>
                <RolePill role={user.role} /> <span className="hint">{ROLES.find((r) => r.value === user.role)?.description}</span>
              </dd>
              <dt>Signed up</dt>
              <dd>{formatDate(user.created_at)}</dd>
            </dl>
          </section>
          <MyDetailsCard />
        </div>
        <div className="column">
          <section className="card">
            <h2>Password</h2>
            <ChangePasswordForm onChanged={() => setSessionsKey((k) => k + 1)} />
          </section>
          <SessionsCard reloadKey={sessionsKey} />
        </div>
      </div>
    </div>
  )
}
