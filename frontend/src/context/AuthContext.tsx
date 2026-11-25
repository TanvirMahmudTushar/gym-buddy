import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import * as authService from "../services/authService"
import { type SessionEnd, refreshSession, setSession, setSessionHandlers } from "../services/api"
import type { Me, SignupBody } from "../types/auth"
import { errorText } from "../utils/text"

interface AuthValue {
  user: Me | null
  /** True while the app asks the server, on first load, whether this browser is still logged in. */
  loading: boolean
  /** Why that first question could not be answered (the server was not reached); "" when it was. */
  startError: string
  /** Ask again after startError. */
  retryStart: () => void
  /** Why the last login ended by itself, for the Log in page. */
  ended: SessionEnd | null
  login: (email: string, password: string) => Promise<void>
  /** Creates the account, then logs in with it. */
  signup: (body: SignupBody) => Promise<void>
  /** Ends the session on the server too, so the refresh cookie and the access token stop working. */
  logout: () => Promise<void>
  setUser: (user: Me) => void
  /** Another tab logged in as someone else, so this tab changed to that account. */
  switched: boolean
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null)
  // Starts true on every load: the refresh cookie cannot be read by scripts, so only the server can say whether
  // there is a session. Until it answers the app shows "Loading…", never the Log in page for a split second.
  const [loading, setLoading] = useState(true)
  const [startError, setStartError] = useState("")
  const [startKey, setStartKey] = useState(0)
  const [ended, setEnded] = useState<SessionEnd | null>(null)
  const [switched, setSwitched] = useState(false)

  const logout = useCallback(async () => {
    try {
      await authService.logout()
    } catch {
      // Offline: the session still ends here, and on the server when its refresh token expires.
    }
    setSession(null)
    setUser(null)
    setSwitched(false)
  }, [])

  useEffect(() => {
    setSessionHandlers({
      onEnd: (reason) => {
        setSession(null)
        setUser(null)
        setEnded(reason)
      },
      onUser: (next, changed) => {
        setUser(next)
        if (changed) setSwitched(true)
      },
      // The menus follow the role as it is now; if it did not change, nothing on screen does.
      onForbidden: () => void authService.getMe().then(setUser, () => undefined),
    })
    return () => setSessionHandlers(null)
  }, [])

  // The message about a switched account goes away with the next page.
  useEffect(() => {
    const onChange = () => setSwitched(false)
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [])

  // Pick the login back up after a reload: swap the refresh cookie for a new access token.
  useEffect(() => {
    let ignore = false
    setLoading(true)
    setStartError("")
    refreshSession()
      .then((result) => !ignore && setUser(result?.user ?? null))
      .catch((err) => !ignore && setStartError(errorText(err)))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [startKey])

  const login = useCallback(async (email: string, password: string) => {
    const result = await authService.login(email, password)
    setSession(result)
    setUser(result.user)
    setEnded(null)
  }, [])

  const signup = useCallback(
    async (body: SignupBody) => {
      await authService.signup(body)
      await login(body.email, body.password)
    },
    [login],
  )

  const retryStart = useCallback(() => setStartKey((k) => k + 1), [])

  const value = useMemo(
    () => ({ user, loading, startError, retryStart, ended, login, signup, logout, setUser, switched }),
    [user, loading, startError, retryStart, ended, login, signup, logout, switched],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error("useAuth must be used inside AuthProvider")
  return value
}
