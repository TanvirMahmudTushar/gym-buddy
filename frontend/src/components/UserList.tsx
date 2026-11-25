import { useEffect, useState } from "react"
import { useAuth } from "../context/AuthContext"
import { usePlans } from "../context/PlansContext"
import { useDebouncedValue } from "../hooks/useDebouncedValue"
import { usePagedList } from "../hooks/usePagedList"
import { useSelection } from "../hooks/useSelection"
import { exportUsersCsv, listUsers } from "../services/adminService"
import type { AdminUser, Role, UserFilters } from "../types/auth"
import { ROLES, can, isAdminAccount, usersLink } from "../utils/auth"
import { hashParams } from "../utils/hash"
import { memberStatus, membersLink } from "../utils/member"
import { count } from "../utils/text"
import { formatDate } from "../utils/time"
import Alert from "./Alert"
import ExportButton from "./ExportButton"
import ListState from "./ListState"
import PageHeader from "./PageHeader"
import Pager from "./Pager"
import StatusPill from "./StatusPill"
import TickAll from "./TickAll"
import UserActionModal, { type UserAction } from "./UserActionModal"

const NO_FILTERS: UserFilters = { q: "", role: "", status: "" }

/** The filters named in the address (#/users?status=banned), so the Dashboard can link to a list. */
function filtersFromHash(): UserFilters {
  const params = hashParams()
  const status = params.get("status")
  return {
    q: "",
    role: ROLES.find((r) => r.value === params.get("role"))?.value ?? "",
    status: status === "active" || status === "banned" ? status : "",
  }
}

// Members and users are the same accounts: this shows the membership and links to it on the Members page.
function MembershipCell({ user: u }: { user: AdminUser }) {
  const { planLabel } = usePlans()
  if (!u.plan || !u.expires_on) return "—"
  return (
    <span>
      <a href={membersLink({ member: u.id })}>{planLabel(u.plan)}</a> <StatusPill status={memberStatus({ is_frozen: u.is_frozen, expires_on: u.expires_on })} />
    </span>
  )
}

// Admins only: everyone who has signed up, with filters, role changes, bans (one or many) and a CSV.
export default function UserList() {
  const { user: me } = useAuth()
  // What the filter boxes show, and (once the typing pauses) what the list is loaded with.
  const [draft, setDraft] = useState<UserFilters>(filtersFromHash)
  const filters = useDebouncedValue(draft)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = () => setReloadKey((k) => k + 1)
  const list = usePagedList(listUsers, filters, reloadKey)
  const selection = useSelection(list.items.map((u) => u.id))
  const [action, setAction] = useState<UserAction | null>(null)
  const [notice, setNotice] = useState("")
  const [exportError, setExportError] = useState("")

  // The menu link, followed while a list from the Dashboard is open, clears its filters.
  useEffect(() => {
    const onChange = () => setDraft(filtersFromHash())
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [])

  return (
    <div className="page">
      <PageHeader title="Users" subtitle="Everyone with an account. Open a name for their records, groups, sessions and activity.">
        {can(me, "users:export") && (
          <ExportButton name="users" load={() => exportUsersCsv(filters)} total={list.total} onError={setExportError} />
        )}
      </PageHeader>
      <section className="card">
        <div className="filters">
          <div className="field grow">
            <label htmlFor="users-q">Search</label>
            <input id="users-q" type="search" placeholder="Name or email" value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} maxLength={100} autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="users-role">Role</label>
            <select id="users-role" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Role | "" })}>
              <option value="">Any</option>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="users-status">Status</label>
            <select id="users-status" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as UserFilters["status"] })}>
              <option value="">Any</option>
              <option value="active">Active</option>
              <option value="banned">Banned</option>
            </select>
          </div>
          <button type="button" onClick={() => setDraft(NO_FILTERS)}>
            Clear
          </button>
        </div>
        <Alert kind="success">{notice}</Alert>
        <Alert>{exportError}</Alert>
        {selection.ids.length > 0 && (
          <div className="bulk-bar">
            <span>{count(selection.ids.length, "user")} selected</span>
            <div className="actions">
              <button type="button" className="small" onClick={selection.clear}>
                Clear
              </button>
              <button type="button" className="small" onClick={() => setAction({ kind: "bulk-unban", ids: selection.ids })}>
                Unban selected
              </button>
              <button type="button" className="small danger" onClick={() => setAction({ kind: "bulk-ban", ids: selection.ids })}>
                Ban selected
              </button>
            </div>
          </div>
        )}
        <ListState loading={list.loading} error={list.error} isEmpty={list.items.length === 0} empty="No users match these filters.">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <TickAll selection={selection} label="Select all users shown" />
                  <th>User</th>
                  <th>Role</th>
                  <th>Membership</th>
                  <th>Status</th>
                  <th>Signed up</th>
                  <th className="act">
                    <span className="visually-hidden">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((u) => {
                  const isMe = u.id === me?.id
                  return (
                    <tr key={u.id}>
                      <td className="tick" data-label="Select">
                        <input type="checkbox" aria-label={`Select ${u.name}`} checked={selection.has(u.id)} onChange={() => selection.toggle(u.id)} />
                      </td>
                      <td className="name">
                        <a href={usersLink(u.id)}>{u.name}</a>
                        {isMe && " (you)"}
                        <span className="hint">{u.email}</span>
                      </td>
                      <td data-label="Role">
                        <select
                          aria-label={`Role of ${u.name}`}
                          value={u.role}
                          // Your own role is locked so the system always keeps an admin.
                          disabled={isMe}
                          onChange={(e) => setAction({ kind: "role", user: u, role: e.target.value as Role })}
                        >
                          {ROLES.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td data-label="Membership">
                        <MembershipCell user={u} />
                      </td>
                      <td data-label="Status">
                        <span>
                          <span className={u.is_banned ? "pill bad" : "pill good"}>{u.is_banned ? "Banned" : "Active"}</span>
                          {u.is_banned && u.ban_reason && <span className="hint">{u.ban_reason}</span>}
                        </span>
                      </td>
                      <td data-label="Signed up" className="nowrap">
                        {formatDate(u.created_at)}
                      </td>
                      <td className="act">
                        {/* Admins cannot be banned: change their role first. */}
                        {!isMe && !isAdminAccount(u) && (
                          <div className="actions">
                            {u.is_banned ? (
                              <button type="button" className="small" onClick={() => setAction({ kind: "unban", user: u })}>
                                Unban
                              </button>
                            ) : (
                              <button type="button" className="small danger" onClick={() => setAction({ kind: "ban", user: u })}>
                                Ban
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager {...list} onChange={list.goTo} />
        </ListState>
      </section>
      {action && (
        <UserActionModal
          action={action}
          onClose={() => setAction(null)}
          onChanged={reload}
          onDone={(message) => {
            setNotice(message)
            setAction(null)
            selection.clear()
            reload()
          }}
        />
      )}
    </div>
  )
}
