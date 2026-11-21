import { type FormEvent, useEffect, useState } from "react"
import { getMyProfile, updateMyProfile } from "../services/meService"
import { errorText } from "../utils/member"
import { type ProfileErrors, type ProfileForm, checkProfile, toProfileBody, toProfileForm } from "../utils/profile"
import ProfileFields from "./ProfileFields"

// My account: the person keeps their own phone, date of birth and emergency contact up to date.
export default function MyDetailsCard() {
  // What is saved, to tell whether the form has changed; null until it has loaded.
  const [saved, setSaved] = useState<ProfileForm | null>(null)
  const [form, setForm] = useState<ProfileForm | null>(null)
  const [errors, setErrors] = useState<ProfileErrors>({})
  const [error, setError] = useState("")
  const [justSaved, setJustSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let ignore = false
    getMyProfile()
      .then((p) => {
        if (ignore) return
        setSaved(toProfileForm(p))
        setForm(toProfileForm(p))
      })
      .catch((err) => !ignore && setError(errorText(err)))
    return () => {
      ignore = true
    }
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    setJustSaved(false)
    const next = checkProfile(form)
    setErrors(next)
    if (Object.keys(next).length) return
    setError("")
    setBusy(true)
    try {
      const fresh = toProfileForm(await updateMyProfile(toProfileBody(form)))
      setSaved(fresh)
      setForm(fresh)
      setJustSaved(true)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const changed = form !== null && saved !== null && JSON.stringify(toProfileBody(form)) !== JSON.stringify(toProfileBody(saved))

  return (
    <section className="card" aria-labelledby="details-heading">
      <h2 id="details-heading">My contact details</h2>
      <p className="hint">Only you and the gym staff can see these. Staff use them to reach you, or your contact in an emergency.</p>
      {!form ? (
        error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : (
          <p className="empty">Loading your details…</p>
        )
      ) : (
        <form className="fields" onSubmit={handleSubmit} noValidate>
          <ProfileFields
            idPrefix="my-details"
            form={form}
            errors={errors}
            onChange={(key, value) => {
              setForm((prev) => prev && { ...prev, [key]: value })
              setJustSaved(false)
            }}
          />
          {error && (
            <p className="error wide-error" role="alert">
              {error}
            </p>
          )}
          <div className="field wide actions">
            <button className="primary" type="submit" disabled={busy || !changed}>
              {busy ? "Saving…" : "Save details"}
            </button>
            {justSaved && <span className="hint">Saved.</span>}
          </div>
        </form>
      )}
    </section>
  )
}
