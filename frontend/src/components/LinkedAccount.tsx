import { type FormEvent, useEffect, useState } from "react"
import { ApiError } from "../services/api"
import { lookupAccountByEmail, lookupAccountById, updateMember } from "../services/memberService"
import type { AccountLookup } from "../types/auth"
import type { Member } from "../types/member"
import { errorText } from "../utils/member"

interface Props {
  member: Member
  /** The member after the account was linked or unlinked. */
  onUpdated: (member: Member) => void
}

// Gym managers and admins link a member record to the person's login account, so that person can see their own
// membership and book classes. One account can be linked to only one member.
export default function LinkedAccount({ member, onUpdated }: Props) {
  const [account, setAccount] = useState<AccountLookup | null>(null)
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    setAccount(null)
    if (member.user_id === null) return
    let ignore = false
    lookupAccountById(member.user_id)
      .then((a) => !ignore && setAccount(a))
      .catch(() => undefined) // shown as "Account #id" below
    return () => {
      ignore = true
    }
  }, [member.user_id])

  async function link(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) {
      setError("Enter the account's email.")
      return
    }
    setBusy(true)
    setError("")
    try {
      const found = await lookupAccountByEmail(email.trim())
      onUpdated(await updateMember(member.id, { user_id: found.id }))
      setEmail("")
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? "No account has that email." : errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function unlink() {
    setBusy(true)
    setError("")
    try {
      onUpdated(await updateMember(member.id, { user_id: null }))
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby={`account-heading-${member.id}`} className="visits">
      <h3 id={`account-heading-${member.id}`}>Linked account</h3>
      {member.user_id !== null ? (
        <div className="inline">
          <span>{account ? `${account.name} (${account.email})` : `Account #${member.user_id}`}</span>
          <button type="button" onClick={unlink} disabled={busy}>
            {busy ? "Unlinking…" : "Unlink"}
          </button>
        </div>
      ) : (
        <form className="inline" onSubmit={link} noValidate>
          <div className="field">
            <label htmlFor={`link-email-${member.id}`}>Account email</label>
            <input
              id={`link-email-${member.id}`}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="member@example.com"
              autoComplete="off"
            />
          </div>
          <button type="submit" disabled={busy}>
            {busy ? "Linking…" : "Link"}
          </button>
        </form>
      )}
      <p className="hint">
        {member.user_id !== null
          ? "This person can log in to see their membership and book classes."
          : "Link the person's login so they can see their membership and book classes."}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
