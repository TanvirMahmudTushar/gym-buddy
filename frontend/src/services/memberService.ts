// fetch helpers for the member REST API (/api/v1/members).
import type { Member, MemberCreate, MemberPage, MemberStatus, MemberUpdate } from "../types/member"

const BASE = "/api/v1/members"
const PAGE_SIZE = 20

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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init.body ? { "Content-Type": "application/json" } : undefined,
  })
  if (!res.ok) throw new Error(await errorMessage(res))
  return (res.status === 204 ? undefined : await res.json()) as T
}

export function listMembers(offset: number, status: MemberStatus | null): Promise<MemberPage> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(PAGE_SIZE) })
  if (status) params.set("status", status)
  return request<MemberPage>(`${BASE}?${params}`)
}

export const getMember = (id: number) => request<Member>(`${BASE}/${id}`)

export const createMember = (body: MemberCreate) =>
  request<Member>(BASE, { method: "POST", body: JSON.stringify(body) })

export const updateMember = (id: number, body: MemberUpdate) =>
  request<Member>(`${BASE}/${id}`, { method: "PATCH", body: JSON.stringify(body) })

export const deleteMember = (id: number) => request<void>(`${BASE}/${id}`, { method: "DELETE" })
