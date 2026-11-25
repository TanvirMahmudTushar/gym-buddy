import { useEffect, useState } from "react"
import { useAuth } from "../context/AuthContext"
import { useSave } from "../hooks/useSave"
import { listMySessions, revokeMySession } from "../services/authService"
import type { SessionInfo } from "../types/auth"
import { describeBrowser } from "../utils/session"
import { errorText } from "../utils/text"
import { formatDateTime } from "../utils/time"
import Alert from "./Alert"
import ListState from "./ListState"

interface Props {
  /** Changes when the list must be loaded again, such as after a password change logged the other browsers out. */
  reloadKey?: number
}

// The browsers where I am logged in. Logging one out ends its session on the server at once.
export default function SessionsCard({ reloadKey = 0 }: Props) {
  const { logout } = useAuth()
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [notice, setNotice] = useState("")
  const { saving, error, run } = useSave()

  useEffect(() => {
    let ignore = false
    setLoading(true)
    setLoadError("")
    listMySessions()
      .then((list) => !ignore && setSessions(list))
      .catch((err) => !ignore && setLoadError(errorText(err)))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [reloadKey])

  const revoke = (s: SessionInfo) =>
    run(async () => {
      setNotice("")
      // Logging out this browser is a normal logout: the app goes back to Log in.
      if (s.current) return logout()
      await revokeMySession(s.id)
      setSessions((prev) => prev.filter((x) => x.id !== s.id))
      setNotice(`${describeBrowser(s.user_agent)} is logged out.`)
    })

  return (
    <section className="card">
      <div>
        <h2>Where I am logged in</h2>
        <p className="hint">A browser stays logged in for 7 days after its last use. Log out any you do not recognise.</p>
      </div>
      <Alert kind="success">{notice}</Alert>
      <Alert>{error}</Alert>
      <ListState loading={loading} error={loadError} isEmpty={sessions.length === 0} empty="No active sessions.">
        <ul className="rows">
          {sessions.map((s) => (
            <li key={s.id}>
              <span>
                <span className="row-title">
                  {describeBrowser(s.user_agent)} {s.current && <span className="pill good">This browser</span>}
                </span>
                <span className="hint">
                  {s.ip ?? "Unknown address"} · last used {formatDateTime(s.last_used_at)}
                </span>
              </span>
              <button type="button" className="small" onClick={() => revoke(s)} disabled={saving}>
                Log out
              </button>
            </li>
          ))}
        </ul>
      </ListState>
    </section>
  )
}
