import { type FormEvent, useState } from "react"
import type { Announcement, AnnouncementBody } from "../types/announcement"
import { gymToday } from "../utils/time"
import FieldError from "./FieldError"
import FormActions from "./FormActions"

interface Props {
  /** The announcement being edited; leave out to post a new one. */
  announcement?: Announcement
  saving: boolean
  error: string
  onSave: (body: AnnouncementBody) => void
  onCancel: () => void
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
  const today = gymToday()
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
      <div className="field wide">
        <label htmlFor="announcement-title">Title</label>
        <input id="announcement-title" value={form.title} onChange={set("title")} maxLength={100} placeholder="Eid holiday hours" autoComplete="off" autoFocus />
        <FieldError>{errors.title}</FieldError>
      </div>
      <div className="field wide">
        <label htmlFor="announcement-message">Message</label>
        <textarea
          id="announcement-message"
          value={form.message}
          onChange={set("message")}
          maxLength={1000}
          rows={4}
          placeholder="The gym opens 10:00 to 16:00 on Eid day and the day after."
        />
        <FieldError>{errors.message}</FieldError>
      </div>
      <div className="field">
        <label htmlFor="announcement-ends">Show until (optional)</label>
        <input id="announcement-ends" type="date" min={endChanged ? today : undefined} value={form.ends_on} onChange={set("ends_on")} />
        <FieldError>{errors.ends_on}</FieldError>
        {!errors.ends_on && <span className="hint">Empty: it stays up until you delete it.</span>}
      </div>
      <FormActions label={editing ? "Save changes" : "Post announcement"} saving={saving} error={error} onCancel={onCancel} />
    </form>
  )
}
