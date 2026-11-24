import { type ReactNode, useEffect, useState } from "react"
import { useAuth } from "../context/AuthContext"
import type { Me } from "../types/auth"
import { type Page, type ProtectedPage, canOpen, roleLabel } from "../utils/auth"

interface Link {
  page: ProtectedPage
  label: string
  /** Other pages reached through this link, so it stays marked as the current one on them. */
  covers?: ProtectedPage[]
}

// The menu, in sections. Each person sees only the pages their permissions allow, and no empty sections.
const SECTIONS: { title: string; links: Link[] }[] = [
  {
    title: "Front desk",
    links: [
      { page: "dashboard", label: "Dashboard" },
      { page: "members", label: "Members" },
      { page: "attendance", label: "Attendance" },
      { page: "payments", label: "Payments" },
    ],
  },
  {
    title: "Gym",
    links: [
      { page: "classes", label: "Classes" },
      { page: "my-classes", label: "My classes" },
      { page: "clients", label: "My clients" },
      { page: "membership", label: "My membership" },
      { page: "timetable", label: "Book a class" },
      { page: "training", label: "Training" },
      { page: "equipment", label: "Equipment" },
      { page: "announcements", label: "Announcements" },
    ],
  },
  {
    title: "Business",
    links: [
      { page: "plans", label: "Plans" },
      { page: "expenses", label: "Expenses" },
    ],
  },
  {
    title: "Administration",
    links: [
      { page: "users", label: "Users and staff" },
      { page: "security", label: "Security", covers: ["activity"] },
    ],
  },
  { title: "You", links: [{ page: "account", label: "My account" }] },
]

function menuFor(user: Me) {
  return SECTIONS.map((s) => ({ ...s, links: s.links.filter((l) => canOpen(user, l.page)) })).filter((s) => s.links.length > 0)
}

interface Props {
  page: Page
  children: ReactNode
  /** Hides the page links, such as while a new password must be chosen. */
  locked?: boolean
}

// The frame around every page: the menu (a sidebar, or a button that opens it on a phone), who is logged in, Log out.
export default function AppLayout({ page, children, locked = false }: Props) {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)

  // On a phone, choosing a page closes the menu.
  useEffect(() => setOpen(false), [page])

  if (!user)
    return (
      <div className="page">
        <header className="brand">
          <h1>Gym Buddy</h1>
          <span className="tagline">Gym management system</span>
        </header>
        {children}
      </div>
    )

  return (
    <div className="shell">
      <header className={open ? "sidebar open" : "sidebar"}>
        <div className="sidebar-head">
          <div className="brand">
            <h1>Gym Buddy</h1>
            <span className="tagline">Gym management system</span>
          </div>
          <button type="button" className="menu-button" aria-expanded={open} aria-controls="main-menu" onClick={() => setOpen((v) => !v)}>
            Menu
          </button>
        </div>
        <div id="main-menu" className="sidebar-body">
          {!locked && (
            <nav aria-label="Main">
              {menuFor(user).map((section) => (
                <div key={section.title} className="nav-section">
                  <h2 className="nav-title">{section.title}</h2>
                  {section.links.map((l) => {
                    const current = l.page === page || (l.covers ?? []).some((p) => p === page)
                    return (
                      <a key={l.page} href={`#/${l.page}`} aria-current={current ? "page" : undefined}>
                        {l.label}
                      </a>
                    )
                  })}
                </div>
              ))}
            </nav>
          )}
          <div className="who">
            <span className="wrap-text">
              {user.name} <span className={`pill role-${user.role}`}>{roleLabel(user.role)}</span>
            </span>
            <button onClick={logout}>Log out</button>
          </div>
        </div>
      </header>
      <main className="content">{children}</main>
    </div>
  )
}
