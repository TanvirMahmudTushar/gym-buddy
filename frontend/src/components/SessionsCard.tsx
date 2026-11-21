import { useEffect, useState } from "react"
import { useAuth } from "../context/AuthContext"
import { listMySessions, revokeMySession } from "../services/authService"
import type { SessionInfo } from "../types/auth"
import { errorText, formatDateTime } from "../utils/member"
import { describeBrowser } from "../utils/session"

interface Props {
  /** Changes when the list must be loaded again, such as after a password change logged the other browsers out. */
  reloadKey?: number
}

// The browsers where I am logged in. Logging one out ends its session on the server at once.
export default function SessionsCard({ reloadKey = 0 }: Props) {
  const { logout } = useAuth()
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busyId, setBusyId] = useState<number | null>(null)

  useEffect(() => {
    let ignore = false
    setLoading(true)
    listMySessions()
      .then((list) => {
        if (ignore) return
        setSessions(list)
        setError("")
      })
      .catch((err) => !ignore && setError(errorText(err)))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [reloadKey])

  async function handleRevoke(s: SessionInfo) {
    // Logging out this browser is a normal logout: the app goes back to Log in.
    if (s.current) {
      await logout()
      return
    }
    setBusyId(s.id)
    setError("")
    setNotice("")
    try {
      await revokeMySession(s.id)
      setSessions((prev) => prev.filter((x) => x.id !== s.id))
      setNotice(`Logged out ${describeBrowser(s.user_agent)}.`)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="card" aria-labelledby="sessions-heading">
      <h2 id="sessions-heading">Where I am logged in</h2>
      <p className="hint">
        Each browser stays logged in for 7 days after it was last used. Log out any you do not recognise, then change
        your password.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="hint" role="status">
          {notice}
        </p>
      )}
      {loading ? (
        <p className="empty">Loading your sessions…</p>
      ) : sessions.length === 0 ? (
        !error && <p className="empty">No active sessions.</p>
      ) : (
        <ul className="visit-list session-list">
          {sessions.map((s) => (
            <li key={s.id}>
              <span>
                <strong>{describeBrowser(s.user_agent)}</strong>
                {s.current && (
                  <>
                    {" "}
                    <span className="pill active">This browser</span>
                  </>
                )}
                <br />
                <span className="hint">
                  {s.ip ?? "Unknown address"} · logged in {formatDateTime(s.created_at)} · last active{" "}
                  {formatDateTime(s.last_used_at)}
                </span>
              </span>
              <button
                type="button"
                className={s.current ? undefined : "danger"}
                onClick={() => handleRevoke(s)}
                disabled={busyId === s.id}
              >
                {busyId === s.id ? "Logging out…" : "Log out"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
