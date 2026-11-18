import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import * as authService from "../services/authService"
import { getToken, setSessionExpiredHandler, setToken } from "../services/api"
import type { SignupBody, User } from "../types/auth"

interface AuthValue {
  user: User | null
  /** True while a saved login is being checked on first load. */
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  /** Creates the account, then logs in with it. */
  signup: (body: SignupBody) => Promise<void>
  logout: () => void
  setUser: (user: User) => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(() => getToken() !== null)

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  // An expired or rejected token logs the person out wherever the request came from.
  useEffect(() => {
    setSessionExpiredHandler(logout)
    return () => setSessionExpiredHandler(null)
  }, [logout])

  // Pick the login back up after a page reload.
  useEffect(() => {
    if (getToken() === null) return
    let ignore = false
    authService
      .getMe()
      .then((me) => !ignore && setUser(me))
      .catch(() => !ignore && logout())
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [logout])

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

  const value = useMemo(() => ({ user, loading, login, signup, logout, setUser }), [user, loading, login, signup, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error("useAuth must be used inside AuthProvider")
  return value
}
