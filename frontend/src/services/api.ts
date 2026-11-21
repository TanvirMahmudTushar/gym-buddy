// The one place that talks to fetch: adds the access token, gets a new one when it expires, turns errors into text.
import type { LoginResult } from "../types/auth"

// The access token is kept only in memory, never in localStorage or sessionStorage, so a script injected into
// the page cannot find it there. After a reload a new one comes from the refresh cookie, which scripts cannot read.
let accessToken: string | null = null

export function setToken(token: string | null): void {
  accessToken = token
}

// Called when the session has ended (refresh refused, or the account banned), so the app can show Log in.
let onSessionExpired: (() => void) | null = null
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler
}

// One refresh at a time. Requests that fail together, and React running the start-up effect twice in development,
// all wait for the same one, so the refresh token is not rotated twice at once.
let refreshing: Promise<LoginResult | null> | null = null

/** Swap the refresh cookie for a new access token. null when this browser has no valid session. */
export function refreshSession(): Promise<LoginResult | null> {
  refreshing ??= (async () => {
    try {
      // The browser adds the HttpOnly refresh cookie itself (same origin, path /api/v1/auth).
      const res = await fetch("/api/v1/auth/refresh", { method: "POST" })
      // 204: no cookie (not logged in). 401: the session expired or was revoked.
      if (res.status !== 200) return null
      const result: LoginResult = await res.json()
      accessToken = result.access_token
      return result
    } catch {
      return null
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

// The text the API sends when an admin has banned the account (must match the backend).
const ACCOUNT_BANNED = "Account banned"

/** An error from the API, with the HTTP status so a page can react to a 404 or 409. */
export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

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

/** Send a request with the access token; throws ApiError for any error status. */
async function send(path: string, init: RequestInit, isRetry = false): Promise<Response> {
  const headers: Record<string, string> = {}
  if (init.body) headers["Content-Type"] = "application/json"
  const token = accessToken
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(path, { ...init, headers })
  if (res.ok) return res

  // A 401 while holding a token: it expired (after 15 minutes) or its session ended. Get a new one once and try
  // again; if another request already got one meanwhile, just try again. A wrong password on Log in has no token.
  if (token && res.status === 401 && !isRetry && (accessToken !== token || (await refreshSession()))) {
    return send(path, init, true)
  }
  const message = await errorMessage(res)
  // The refresh failed too, or the account is banned: the session is over, so the app shows Log in.
  if (token && (res.status === 401 || (res.status === 403 && message === ACCOUNT_BANNED))) onSessionExpired?.()
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
