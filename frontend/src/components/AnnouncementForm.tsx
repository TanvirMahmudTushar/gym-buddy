import { type FormEvent, useState } from "react"
import type { Announcement, AnnouncementBody } from "../types/announcement"
import { todayUtc } from "../utils/member"

interface Props {
  /** The announcement being edited; leave out to post a new one. */
  announcement?: Announcement
  saving: boolean
  error: string
  onSave: (body: AnnouncementBody) => void
  onCancel?: () => void
}

type Errors = Partial<Record<"title" | "message" | "ends_on", string>>

// One form for posting and editing an announcement, with the same checks the API makes.
export default function AnnouncementForm({ announcement, saving, error, onSave, onCancel }: Props) {
  const editing = announcement !== undefined
  const [form, setForm] = useState({
    title: announcement?.title ?? "",
    message: announcement?.message ?? "",
    ends_on: announcement?.ends_on ?? "",
  })
  const [errors, setErrors] = useState<Errors>({})
  const id = editing ? `edit-announcement-${announcement.id}` : "add-announcement"
  const today = todayUtc()
  // An ended announcement keeps its old date until someone picks a new one, so it can still be edited.
  const endChanged = !editing || form.ends_on !== (announcement.ends_on ?? "")
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const next: Errors = {}
    if (!form.title.trim()) next.title = "Enter a title."
    if (!form.message.trim()) next.message = "Enter the message."
    if (endChanged && form.ends_on && form.ends_on < today) next.ends_on = "Pick today or a later day."
    setErrors(next)
    if (Object.keys(next).length) return
    onSave({
      title: form.title.trim(),
      message: form.message.trim(),
      // Left out of an edit when unchanged; an empty date means no end date.
      ends_on: endChanged ? form.ends_on || null : undefined,
    })
  }

  return (
    <form className="fields" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor={`${id}-title`}>Title</label>
        <input id={`${id}-title`} value={form.title} onChange={set("title")} maxLength={100} placeholder="Eid holiday hours" autoComplete="off" />
        {errors.title && <span className="field-error">{errors.title}</span>}
      </div>
      <div className="field">
        <label htmlFor={`${id}-ends`}>Show until (optional)</label>
        <input
          id={`${id}-ends`}
          type="date"
          min={endChanged ? today : undefined}
          value={form.ends_on}
          onChange={set("ends_on")}
          aria-describedby={`${id}-ends-hint`}
        />
        <span id={`${id}-ends-hint`} className="hint">
          The last day it shows (UTC). Leave empty to keep it up until you delete it.
        </span>
        {errors.ends_on && <span className="field-error">{errors.ends_on}</span>}
      </div>
      <div className="field wide">
        <label htmlFor={`${id}-message`}>Message</label>
        <textarea
          id={`${id}-message`}
          value={form.message}
          onChange={set("message")}
          maxLength={1000}
          rows={4}
          placeholder="The gym opens 10:00 to 16:00 on Eid day and the day after."
        />
        {errors.message && <span className="field-error">{errors.message}</span>}
      </div>
      <div className="field wide actions">
        <button className="primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : editing ? "Save announcement" : "Post announcement"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
        <span className="hint">Members see it on My membership; staff on the Overview.</span>
      </div>
      {error && (
        <p className="error wide-error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
