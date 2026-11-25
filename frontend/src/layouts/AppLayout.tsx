import { type ReactNode, useEffect, useState } from "react"
import Icon, { type IconName } from "../components/Icon"
import { useAuth } from "../context/AuthContext"
import type { Me } from "../types/auth"
import { PAGE_TITLES, type Page, type ProtectedPage, canOpen, homePage, roleLabel } from "../utils/auth"
import { initials } from "../utils/text"

// The menu, in sections. Each person sees only the pages their permissions allow, and no empty sections.
const SECTIONS: { title: string; pages: ProtectedPage[] }[] = [
  { title: "Front desk", pages: ["dashboard", "members", "attendance", "payments"] },
  { title: "Gym", pages: ["my-classes", "clients", "membership", "timetable", "classes", "training", "equipment", "announcements"] },
  { title: "Business", pages: ["plans", "expenses"] },
  { title: "Administration", pages: ["users", "security", "activity"] },
  { title: "You", pages: ["account"] },
]

const ICONS: Record<ProtectedPage, IconName> = {
  dashboard: "dashboard",
  members: "members",
  attendance: "attendance",
  payments: "payments",
  classes: "classes",
  training: "training",
  equipment: "equipment",
  announcements: "announcements",
  plans: "plans",
  expenses: "expenses",
  users: "users",
  activity: "activity",
  security: "security",
  "my-classes": "classes",
  clients: "clients",
  membership: "membership",
  timetable: "classes",
  account: "account",
}

const menuFor = (user: Me) =>
  SECTIONS.map((s) => ({ ...s, pages: s.pages.filter((p) => canOpen(user, p)) })).filter((s) => s.pages.length > 0)

export function Brand({ href }: { href?: string }) {
  const content = (
    <>
      <span className="brand-mark">
        <Icon name="training" />
      </span>
      Gym Buddy
    </>
  )
  return href ? (
    <a className="brand" href={href}>
      {content}
    </a>
  ) : (
    <div className="brand">{content}</div>
  )
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

  if (!user) return null

  return (
    <div className="shell">
      <div className={open ? "sidebar open" : "sidebar"}>
        <div className="sidebar-head">
          <Brand href={`#/${homePage(user)}`} />
          <button type="button" className="menu-button" aria-expanded={open} aria-controls="main-menu" onClick={() => setOpen((v) => !v)}>
            <Icon name={open ? "close" : "menu"} /> Menu
          </button>
        </div>
        <div id="main-menu" className="sidebar-body">
          <nav aria-label="Main">
            {!locked &&
              menuFor(user).map((section) => (
                <div key={section.title} className="nav-section">
                  <span className="nav-title">{section.title}</span>
                  {section.pages.map((p) => (
                    <a key={p} href={`#/${p}`} aria-current={p === page ? "page" : undefined} onClick={() => setOpen(false)}>
                      <Icon name={ICONS[p]} /> {PAGE_TITLES[p]}
                    </a>
                  ))}
                </div>
              ))}
          </nav>
          <div className="who">
            <span className="avatar" aria-hidden="true">
              {initials(user.name)}
            </span>
            <span className="who-name">
              {user.name}
              <span className="hint">{roleLabel(user.role)}</span>
            </span>
            <button type="button" className="icon-button" onClick={logout} aria-label="Log out" title="Log out">
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </div>
      <main className="content">{children}</main>
    </div>
  )
}
