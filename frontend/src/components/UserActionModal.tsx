import { type FormEvent, useState } from "react"
import { useSave } from "../hooks/useSave"
import { banUser, bulkBan, bulkUnban, changeRole, resetPassword, revokeSessions, unbanUser } from "../services/adminService"
import type { AdminUser, Role, SkippedUser } from "../types/auth"
import { ROLES, roleLabel } from "../utils/auth"
import { count } from "../utils/text"
import Alert from "./Alert"
import ConfirmModal from "./ConfirmModal"
import FormActions from "./FormActions"
import Modal from "./Modal"

/** What an admin is about to do, and to whom. The Users list and a user's details open the same dialogs. */
export type UserAction =
  | { kind: "ban" | "unban" | "reset" | "revoke"; user: AdminUser }
  | { kind: "role"; user: AdminUser; role: Role }
  | { kind: "bulk-ban" | "bulk-unban"; ids: number[] }

interface Props {
  action: UserAction
  /** It worked: a sentence saying what happened. The caller closes the dialog and loads its data again. */
  onDone: (message: string) => void
  /** A reset worked: the dialog stays open to show the temporary password, so the caller only loads again. */
  onChanged: () => void
  onClose: () => void
}

/** " Skipped: Abe Admin (You cannot ban an admin; ...)." */
function skippedText(skipped: SkippedUser[]): string {
  if (skipped.length === 0) return ""
  return ` Skipped: ${skipped.map((s) => `${s.name ?? `#${s.id}`} (${s.reason})`).join(", ")}.`
}

interface ReasonProps {
  title: string
  text: string
  label: string
  danger?: boolean
  run: (reason: string) => Promise<string>
  onDone: (message: string) => void
  onClose: () => void
}

// Ban or unban, one account or many: the same form, with the reason that goes to the activity log.
function ReasonModal({ title, text, label, danger = false, run: act, onDone, onClose }: ReasonProps) {
  const [reason, setReason] = useState("")
  const { saving, error, run } = useSave()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    void run(async () => onDone(await act(reason.trim())))
  }

  return (
    <Modal title={title} onClose={onClose} narrow>
      <p>{text}</p>
      <form className="fields" onSubmit={handleSubmit}>
        <div className="field wide">
          <label htmlFor="action-reason">Reason (optional, kept in the activity log)</label>
          <input id="action-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} autoFocus autoComplete="off" />
        </div>
        <FormActions label={label} saving={saving} error={error} danger={danger} onCancel={onClose} />
      </form>
    </Modal>
  )
}

// The temporary password is shown only this once: it is not stored anywhere in plain text.
function ResetModal({ user, onChanged, onClose }: { user: AdminUser; onChanged: () => void; onClose: () => void }) {
  const [password, setPassword] = useState("")
  const [copied, setCopied] = useState(false)

  if (!password)
    return (
      <ConfirmModal
        title={`Reset ${user.name}'s password?`}
        confirmLabel="Reset password"
        busyLabel="Resetting…"
        onClose={onClose}
        onConfirm={async () => {
          const result = await resetPassword(user.id)
          setPassword(result.temporary_password)
          onChanged()
        }}
      >
        Their current password and every login stop working. You get a temporary password to give them, and they must choose their own when they
        log in with it.
      </ConfirmModal>
    )

  async function copy() {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
    } catch {
      // No clipboard access: the password can be selected and copied by hand.
    }
  }

  return (
    <Modal title={`Temporary password for ${user.name}`} onClose={onClose} narrow>
      <div className="actions">
        <code className="temp-password">{password}</code>
        <button type="button" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <Alert kind="info">Shown only this once. Give it to them in person.</Alert>
      <div className="actions end">
        <button type="button" className="primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  )
}

export default function UserActionModal({ action, onDone, onChanged, onClose }: Props) {
  if ("ids" in action) {
    const { ids, kind } = action
    const label = count(ids.length, "user")
    return kind === "bulk-ban" ? (
      <ReasonModal
        title={`Ban ${label}?`}
        text="They are logged out at once and cannot log in until unbanned. You and other admins are skipped."
        label={`Ban ${label}`}
        danger
        onClose={onClose}
        onDone={onDone}
        run={async (reason) => {
          const result = await bulkBan(ids, reason)
          return `Banned ${result.banned.length} of ${label}.${skippedText(result.skipped)}`
        }}
      />
    ) : (
      <ReasonModal
        title={`Unban ${label}?`}
        text="Only banned accounts change. Their old sessions stay ended; they log in again."
        label={`Unban ${label}`}
        onClose={onClose}
        onDone={onDone}
        run={async (reason) => {
          const result = await bulkUnban(ids, reason)
          return `Unbanned ${result.unbanned.length} of ${label}.${skippedText(result.skipped)}`
        }}
      />
    )
  }

  const { user } = action
  switch (action.kind) {
    case "ban":
      return (
        <ReasonModal
          title={`Ban ${user.name}?`}
          text="They are logged out at once and cannot log in until you unban them."
          label="Ban user"
          danger
          onClose={onClose}
          onDone={onDone}
          run={async (reason) => {
            await banUser(user.id, reason)
            return `${user.name} is banned and logged out of every browser.`
          }}
        />
      )
    case "unban":
      return (
        <ConfirmModal
          title={`Unban ${user.name}?`}
          confirmLabel="Unban"
          busyLabel="Unbanning…"
          onClose={onClose}
          onConfirm={async () => {
            await unbanUser(user.id)
            onDone(`${user.name} can log in again.`)
          }}
        >
          They can log in again with the same role and data.
        </ConfirmModal>
      )
    case "role":
      return (
        <ConfirmModal
          title={`Make ${user.name} ${action.role === "admin" ? "an" : "a"} ${roleLabel(action.role)}?`}
          confirmLabel="Change role"
          busyLabel="Changing…"
          onClose={onClose}
          onConfirm={async () => {
            await changeRole(user.id, action.role)
            onDone(`${user.name} is now ${action.role === "admin" ? "an" : "a"} ${roleLabel(action.role)}.`)
          }}
        >
          {ROLES.find((r) => r.value === action.role)?.description} It takes effect on their next request.
          {user.role === "trainer" && " Their classes keep their name, and their clients have no trainer until someone picks one."}
        </ConfirmModal>
      )
    case "revoke":
      return (
        <ConfirmModal
          title={`Log ${user.name} out everywhere?`}
          confirmLabel="Log out everywhere"
          busyLabel="Logging out…"
          onClose={onClose}
          onConfirm={async () => {
            const { revoked } = await revokeSessions(user.id)
            onDone(`${user.name} is logged out of ${count(revoked, "browser")}.`)
          }}
        >
          Their next request is refused and they must log in again. Their password does not change.
        </ConfirmModal>
      )
    case "reset":
      return <ResetModal user={user} onChanged={onChanged} onClose={onClose} />
  }
}
