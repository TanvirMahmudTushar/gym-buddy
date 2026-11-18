// The one place that talks to fetch: adds the login token, turns errors into readable text.
const TOKEN_KEY = "gym-buddy-token"

// sessionStorage: the login ends when the tab is closed, and the token is not kept on disk.
export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // Storage blocked: the login only lasts until the page reloads.
  }
}

// Called when the API rejects a token we sent (expired, or the account is gone), so the app can log out.
let onSessionExpired: (() => void) | null = null
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler
}

// The text the API sends when an admin has banned the account (must match the backend).
const ACCOUNT_BANNED = "Account banned"

interface ValidationError {
  loc: (string | number)[]
  msg: string
}

/** Turn FastAPI's {"detail": ...} into one readable sentence. */
async function errorMessage(res: Response): Promise<string> {
  try {
    const body: { detail?: string | ValidationError[] } = await res.json()
    if (typeof body.detail === "string") return body.detail
    if (Array.isArray(body.detail)) {
      return body.detail
        .map((e) => {
          const field = e.loc.slice(1).join(".")
          const msg = e.msg.replace(/^Value error, /, "")
          return field ? `${field}: ${msg}` : msg
        })
        .join("; ")
    }
  } catch {
    // Not JSON: fall through to the status code.
  }
  return `Request failed: ${res.status}`
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (init.body) headers["Content-Type"] = "application/json"
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(path, { ...init, headers })
  if (!res.ok) {
    // A 401 while holding a token means it is no longer valid. A wrong password on the login form has no token yet.
    const message = await errorMessage(res)
    // A ban also ends the login, so the person is sent back to Log in with a clear reason on their next try.
    if (token && (res.status === 401 || (res.status === 403 && message === ACCOUNT_BANNED))) onSessionExpired?.()
    throw new Error(message)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}
