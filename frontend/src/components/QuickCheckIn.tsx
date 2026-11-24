import { type FormEvent, useEffect, useState } from "react"
import { useDebouncedValue } from "../hooks/useDebouncedValue"
import { recordCheckIn } from "../services/checkInService"
import { listMembers } from "../services/memberService"
import type { Member } from "../types/member"
import { errorText, formatTime, memberStatus, membersLink } from "../utils/member"
import StatusPill from "./StatusPill"

const SHOWN = 6

// The front desk's check-in box: type part of a name, email or phone, then press Check in next to the person.
export default function QuickCheckIn({ onCheckedIn }: { onCheckedIn: () => void }) {
  const [search, setSearch] = useState("")
  const query = useDebouncedValue(search.trim())
  const [found, setFound] = useState<Member[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (!query) {
      setFound([])
      return
    }
    let ignore = false
    setLoading(true)
    setError("")
    listMembers(0, null, query)
      .then((page) => !ignore && setFound(page.items.slice(0, SHOWN)))
      .catch((err) => !ignore && setError(errorText(err)))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [query])

  async function checkIn(member: Member) {
    setBusyId(member.id)
    setError("")
    setMessage("")
    try {
      const visit = await recordCheckIn(member.id)
      setMessage(`${member.name} checked in at ${formatTime(visit.checked_in_at)}.`)
      setSearch("")
      onCheckedIn()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusyId(null)
    }
  }

  // Enter checks in the person when the search found exactly one who may come in.
  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (found.length === 1 && memberStatus(found[0]) === "active") void checkIn(found[0])
  }

  return (
    <section className="card" aria-labelledby="quick-heading">
      <h2 id="quick-heading">Check in a member</h2>
      <form onSubmit={handleSubmit} role="search">
        <input
          type="search"
          aria-label="Find a member by name, email or phone"
          placeholder="Name, email or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          maxLength={100}
          autoComplete="off"
        />
      </form>
      {query && !loading && found.length === 0 && !error && <p className="empty">No member matches "{query}".</p>}
      {found.length > 0 && (
        <ul className="visit-list">
          {found.map((m) => {
            const status = memberStatus(m)
            return (
              <li key={m.id}>
                <span className="wrap-text">
                  <a href={membersLink({ member: m.id })}>{m.name}</a> <StatusPill status={status} />{" "}
                  <span className="hint">{m.phone ?? m.email}</span>
                </span>
                <button type="button" className="primary" onClick={() => checkIn(m)} disabled={busyId !== null || status !== "active"}>
                  {busyId === m.id ? "Checking in…" : "Check in"}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {message && (
        <p className="hint" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
