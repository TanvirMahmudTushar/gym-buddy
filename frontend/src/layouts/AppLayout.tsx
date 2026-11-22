import type { ReactNode } from "react"
import { useAuth } from "../context/AuthContext"
import { type ProtectedPage, type Page, canOpen, roleLabel } from "../utils/auth"

const LINKS: { page: ProtectedPage; label: string }[] = [
  { page: "dashboard", label: "Dashboard" },
  { page: "overview", label: "Overview" },
  { page: "members", label: "Members" },
  { page: "classes", label: "Classes" },
  { page: "payments", label: "Payments" },
  { page: "announcements", label: "Announcements" },
  { page: "users", label: "Users" },
  { page: "plans", label: "Plans" },
  { page: "membership", label: "My membership" },
  { page: "timetable", label: "Classes" },
  { page: "my-classes", label: "My classes" },
  { page: "account", label: "My account" },
]

// The header shared by every page: the name, the pages this role may open, who is logged in, and Log out.
interface Props {
  page: Page
  children: ReactNode
  /** Hides the page links, such as while a new password must be chosen. */
  locked?: boolean
}

export default function AppLayout({ page, children, locked = false }: Props) {
  const { user, logout } = useAuth()

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <h1>Gym Buddy</h1>
          <span className="tagline">Member records for the front desk</span>
        </div>
        {user && (
          <>
            {!locked && (
              <nav aria-label="Main">
                {LINKS.filter((l) => canOpen(user, l.page)).map((l) => (
                  <a key={l.page} href={`#/${l.page}`} aria-current={page === l.page ? "page" : undefined}>
                    {l.label}
                  </a>
                ))}
              </nav>
            )}
            <div className="who">
              <span>
                {user.name} <span className={`pill role-${user.role}`}>{roleLabel(user.role)}</span>
              </span>
              <button onClick={logout}>Log out</button>
            </div>
          </>
        )}
      </header>
      {children}
    </div>
  )
}
