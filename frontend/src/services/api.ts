// The one place that talks to fetch: adds the access token, gets a new one when it expires, turns errors into text.
import type { LoginResult, Me } from "../types/auth"

// The access token is kept only in memory, never in localStorage or sessionStorage, so a script injected into
// the page cannot find it there. After a reload a new one comes from the refresh cookie, which scripts cannot read.
let accessToken: string | null = null
// The account this tab is logged in as. Every tab shares the refresh cookie, so after another tab logs in as someone
// else, this tab's next refresh answers with that account.
let account: number | null = null

/** The login this tab has now, or null after a logout. */
export function setSession(login: LoginResult | null): void {
  accessToken = login?.access_token ?? null
  account = login?.user.id ?? null
}

/** Why a login ended without the person logging out. */
export type SessionEnd = "expired" | "banned"

interface SessionHandlers {
  /** The server no longer accepts the login, so the app shows Log in. */
  onEnd: (reason: SessionEnd) => void
  /** A refresh answered with the account as it is now, such as with a new role. `switched`: it is another account than
   * this tab had, because another tab logged in. */
  onUser: (user: Me, switched: boolean) => void
  /** The server refused something for lack of permission: the role may have changed since the app loaded it. */
  onForbidden: () => void
}

// Set by AuthContext, which holds the login.
let handlers: SessionHandlers | null = null
export function setSessionHandlers(next: SessionHandlers | null): void {
  handlers = next
}

/** An error from the API, with the HTTP status so a page can react to a 404 or 409. 0: the server was not reached. */
export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function reach(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(path, init)
  } catch {
    throw new ApiError("Could not reach the server. Check your connection and try again.", 0)
  }
}

// One refresh at a time. Requests that fail together, and React running the start-up effect twice in development,
// all wait for the same one, so the refresh token is not rotated twice at once.
let refreshing: Promise<LoginResult | null> | null = null

/** Swap the refresh cookie for a new access token. null when this browser has no valid session. Throws when the server
 * could not be reached or failed: that says nothing about the session, so nobody is logged out for it. */
export function refreshSession(): Promise<LoginResult | null> {
  refreshing ??= (async () => {
    try {
      // The browser adds the HttpOnly refresh cookie itself (same origin, path /api/v1/auth).
      const res = await reach("/api/v1/auth/refresh", { method: "POST" })
      // 204: no cookie (not logged in). 401: the session expired or was revoked.
      if (res.status === 204 || res.status === 401) return null
      if (!res.ok) throw new ApiError(await errorMessage(res), res.status)
      const result: LoginResult = await res.json()
      const switched = account !== null && account !== result.user.id
      setSession(result)
      handlers?.onUser(result.user, switched)
      return result
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

// Texts the API sends that the app acts on (they must match the backend).
const ACCOUNT_BANNED = "Account banned"
const NO_PERMISSION = "You do not have permission to do this"

/** The {"detail": "one sentence"} every error from the API has. */
async function errorMessage(res: Response): Promise<string> {
  try {
    const body: { detail?: unknown } = await res.json()
    if (typeof body.detail === "string") return body.detail
  } catch {
    // Not JSON, such as an error page from the host: fall through to the status code.
  }
  return `The server could not answer (${res.status}). Try again in a moment.`
}

/** Send a request with the access token; throws ApiError for any error status. */
async function send(path: string, init: RequestInit, isRetry = false): Promise<Response> {
  const sentAs = account
  const headers: Record<string, string> = {}
  if (init.body) headers["Content-Type"] = "application/json"
  const token = accessToken
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await reach(path, { ...init, headers })
  if (res.ok) return res

  // A 401 while holding a token: it expired (after 5 minutes) or its session ended. Get a new one once and try
  // again; if another request already got one meanwhile, just try again. A wrong password on Log in has no token.
  if (token && res.status === 401 && !isRetry && (accessToken !== token || (await refreshSession()))) {
    if (account === sentAs) return send(path, init, true)
    // Never repeat a request as someone else: what one person asked for would change another person's account.
    if (account !== null) throw new ApiError("Another tab logged in as someone else, so this was not done.", 401)
  }
  const message = await errorMessage(res)
  // The refresh was refused too, or the account is banned: the session is over, so the app shows Log in.
  if (token && res.status === 401) handlers?.onEnd("expired")
  if (token && res.status === 403 && message === ACCOUNT_BANNED) handlers?.onEnd("banned")
  if (token && res.status === 403 && message === NO_PERMISSION) handlers?.onForbidden()
  throw new ApiError(message, res.status)
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await send(path, init)
  return (res.status === 204 ? undefined : await res.json()) as T
}

/** For a file download (such as a CSV) that needs the login token, so a plain link would not work. */
export async function requestBlob(path: string): Promise<Blob> {
  const res = await send(path, {})
  return res.blob()
}
