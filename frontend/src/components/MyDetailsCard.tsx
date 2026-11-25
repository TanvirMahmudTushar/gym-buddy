import { type FormEvent, useEffect, useState } from "react"
import { useSave } from "../hooks/useSave"
import { getMyProfile, updateMyProfile } from "../services/meService"
import { type ProfileErrors, type ProfileForm, checkProfile, toProfileBody, toProfileForm } from "../utils/profile"
import { errorText } from "../utils/text"
import Alert from "./Alert"
import ProfileFields from "./ProfileFields"

// My account: the person keeps their own phone, date of birth and emergency contact up to date.
export default function MyDetailsCard() {
  // What is saved, to tell whether the form has changed; null until it has loaded.
  const [saved, setSaved] = useState<ProfileForm | null>(null)
  const [form, setForm] = useState<ProfileForm | null>(null)
  const [errors, setErrors] = useState<ProfileErrors>({})
  const [loadError, setLoadError] = useState("")
  const [justSaved, setJustSaved] = useState(false)
  const { saving, error, run } = useSave()

  useEffect(() => {
    let ignore = false
    getMyProfile()
      .then((p) => {
        if (ignore) return
        setSaved(toProfileForm(p))
        setForm(toProfileForm(p))
      })
      .catch((err) => !ignore && setLoadError(errorText(err)))
    return () => {
      ignore = true
    }
  }, [])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    setJustSaved(false)
    const next = checkProfile(form)
    setErrors(next)
    if (Object.keys(next).length) return
    void run(async () => {
      const fresh = toProfileForm(await updateMyProfile(toProfileBody(form)))
      setSaved(fresh)
      setForm(fresh)
      setJustSaved(true)
    })
  }

  const changed = form !== null && saved !== null && JSON.stringify(toProfileBody(form)) !== JSON.stringify(toProfileBody(saved))

  return (
    <section className="card">
      <div>
        <h2>Contact details</h2>
        <p className="hint">Only you and the gym staff can see these.</p>
      </div>
      {!form ? (
        loadError ? (
          <Alert>{loadError}</Alert>
        ) : (
          <p className="empty">Loading…</p>
        )
      ) : (
        <form className="stack" onSubmit={handleSubmit} noValidate>
          <div className="fields">
            <ProfileFields
              idPrefix="my-details"
              form={form}
              errors={errors}
              onChange={(key, value) => {
                setForm((prev) => prev && { ...prev, [key]: value })
                setJustSaved(false)
              }}
            />
          </div>
          <Alert>{error}</Alert>
          <Alert kind="success">{justSaved && "Your details are saved."}</Alert>
          <div className="actions">
            <button className="primary" type="submit" disabled={saving || !changed}>
              {saving ? "Saving…" : "Save details"}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
