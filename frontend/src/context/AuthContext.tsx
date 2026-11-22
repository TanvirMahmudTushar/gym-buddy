import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import * as authService from "../services/authService"
import { refreshSession, setSessionExpiredHandler, setToken } from "../services/api"
import type { Me, SignupBody } from "../types/auth"

interface AuthValue {
  user: Me | null
  /** True while the app asks the server, on first load, whether this browser is still logged in. */
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  /** Creates the account, then logs in with it. */
  signup: (body: SignupBody) => Promise<void>
  /** Ends the session on the server too, so the refresh cookie and the access token stop working. */
  logout: () => Promise<void>
  /** Forget the login in this tab only, after the server has already ended the session. */
  endSession: () => void
  setUser: (user: Me) => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null)
  // Starts true on every load: the refresh cookie cannot be read by scripts, so only the server can say whether
  // there is a session. Until it answers the app shows "Loading…", never the Log in page for a split second.
  const [loading, setLoading] = useState(true)

  const endSession = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  const logout = useCallback(async () => {
    try {
      await authService.logout()
    } catch {
      // Offline: the session still ends here, and on the server when its refresh token expires.
    }
    endSession()
  }, [endSession])

  // A refused refresh or a ban ends the login wherever the request came from.
  useEffect(() => {
    setSessionExpiredHandler(endSession)
    return () => setSessionExpiredHandler(null)
  }, [endSession])

  // Pick the login back up after a reload: swap the refresh cookie for a new access token.
  useEffect(() => {
    let ignore = false
    refreshSession()
      .then((result) => !ignore && result && setUser(result.user))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const result = await authService.login(email, password)
    setToken(result.access_token)
    setUser(result.user)
  }, [])

  const signup = useCallback(
    async (body: SignupBody) => {
      await authService.signup(body)
      await login(body.email, body.password)
    },
    [login],
  )

  const value = useMemo(
    () => ({ user, loading, login, signup, logout, endSession, setUser }),
    [user, loading, login, signup, logout, endSession],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error("useAuth must be used inside AuthProvider")
  return value
}
