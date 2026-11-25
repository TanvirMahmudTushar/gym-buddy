import { type FormEvent, useEffect, useState } from "react"
import { useDebouncedValue } from "../hooks/useDebouncedValue"
import { useSave } from "../hooks/useSave"
import { recordCheckIn } from "../services/checkInService"
import { listMembers } from "../services/memberService"
import type { Member } from "../types/member"
import { memberStatus, membersLink } from "../utils/member"
import { errorText } from "../utils/text"
import { formatTime } from "../utils/time"
import Alert from "./Alert"
import StatusPill from "./StatusPill"

const SHOWN = 6

// The front desk's check-in box: type part of a name, email or phone, then press Check in next to the person.
export default function QuickCheckIn({ onCheckedIn }: { onCheckedIn: () => void }) {
  const [search, setSearch] = useState("")
  const query = useDebouncedValue(search.trim())
  // The people found, and the search they were found with.
  const [found, setFound] = useState<{ query: string; members: Member[] }>({ query: "", members: [] })
  const [searchError, setSearchError] = useState("")
  const { saving, error, run } = useSave()
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (!query) {
      setFound({ query: "", members: [] })
      return
    }
    let ignore = false
    setSearchError("")
    listMembers({ status: null, q: query }, 0)
      .then((page) => !ignore && setFound({ query, members: page.items.slice(0, SHOWN) }))
      .catch((err) => !ignore && setSearchError(errorText(err)))
    return () => {
      ignore = true
    }
  }, [query])

  const checkIn = (member: Member) =>
    run(async () => {
      setMessage("")
      const visit = await recordCheckIn(member.id)
      setMessage(`${member.name} checked in at ${formatTime(visit.checked_in_at)}.`)
      setSearch("")
      onCheckedIn()
    })

  // Enter checks in the person when the search found exactly one who may come in.
  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const [only, ...rest] = found.members
    if (only && rest.length === 0 && found.query === search.trim() && memberStatus(only) === "active" && !saving) void checkIn(only)
  }

  return (
    <section className="card">
      <h2>Check in a member</h2>
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
      <Alert kind="success">{message}</Alert>
      <Alert>{error || searchError}</Alert>
      {query && found.query === query && found.members.length === 0 && <p className="hint">No member matches "{query}".</p>}
      {found.members.length > 0 && (
        <ul className="rows">
          {found.members.map((m) => {
            const status = memberStatus(m)
            return (
              <li key={m.id}>
                <span>
                  <a href={membersLink({ member: m.id })}>{m.name}</a> <StatusPill status={status} />
                  <span className="row-note hint">{m.phone ?? m.email}</span>
                </span>
                <button type="button" className="small primary" onClick={() => checkIn(m)} disabled={saving || status !== "active"}>
                  Check in
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
