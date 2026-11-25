import { useEffect, useState } from "react"
import Alert from "../../components/Alert"
import Icon from "../../components/Icon"
import ListState from "../../components/ListState"
import PageHeader from "../../components/PageHeader"
import { useAuth } from "../../context/AuthContext"
import { useSave } from "../../hooks/useSave"
import { listMySessions, revokeMySession } from "../../services/authService"
import type { SessionInfo } from "../../types/auth"
import { describeBrowser, deviceIcon } from "../../utils/session"
import { errorText } from "../../utils/text"
import { formatDateTime } from "../../utils/time"

// Every logged-in person sees this page: the devices that hold a valid refresh token for their account. Logging one out
// ends it on the server at once.
export default function DevicesPage() {
  const { logout } = useAuth()
  const [devices, setDevices] = useState<SessionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [notice, setNotice] = useState("")
  const { saving, error, run } = useSave()

  useEffect(() => {
    let ignore = false
    listMySessions()
      .then((list) => !ignore && setDevices(list))
      .catch((err) => !ignore && setLoadError(errorText(err)))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [])

  const revoke = (d: SessionInfo) =>
    run(async () => {
      setNotice("")
      // Logging out this device is a normal logout: the app goes back to Log in.
      if (d.current) return logout()
      await revokeMySession(d.id)
      setDevices((prev) => prev.filter((x) => x.id !== d.id))
      setNotice(`${describeBrowser(d.user_agent)} is logged out.`)
    })

  return (
    <div className="page">
      <PageHeader title="Login devices" subtitle="Where you are logged in. Log out any device you do not recognise, then change your password." />
      <section className="card">
        <Alert kind="success">{notice}</Alert>
        <Alert>{error}</Alert>
        <ListState loading={loading} error={loadError} isEmpty={devices.length === 0} empty="No login devices.">
          <ul className="rows">
            {devices.map((d) => (
              <li key={d.id}>
                <span className="device">
                  <Icon name={deviceIcon(d.user_agent)} />
                  <span>
                    <span className="row-title">
                      {describeBrowser(d.user_agent)} {d.current && <span className="pill good">This device</span>}
                    </span>
                    <span className="hint row-note">
                      Logged in {formatDateTime(d.created_at)} from {d.ip ?? "an unknown address"}
                    </span>
                    <span className="hint row-note">
                      Last used {formatDateTime(d.last_used_at)} · login ends {formatDateTime(d.expires_at)} if not used again
                    </span>
                  </span>
                </span>
                <button type="button" className="small" onClick={() => revoke(d)} disabled={saving}>
                  Log out
                </button>
              </li>
            ))}
          </ul>
        </ListState>
      </section>
    </div>
  )
}
