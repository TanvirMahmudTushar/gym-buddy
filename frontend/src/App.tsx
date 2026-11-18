import { useEffect, useState } from "react"
import { useAuth } from "./context/AuthContext"
import AppLayout from "./layouts/AppLayout"
import AccountPage from "./pages/AccountPage"
import ClassesPage from "./pages/ClassesPage"
import DashboardPage from "./pages/DashboardPage"
import HomePage from "./pages/HomePage"
import LoginPage from "./pages/LoginPage"
import MembershipPage from "./pages/MembershipPage"
import PlansPage from "./pages/PlansPage"
import SignupPage from "./pages/SignupPage"
import TimetablePage from "./pages/TimetablePage"
import UsersPage from "./pages/UsersPage"
import { type Page, type ProtectedPage, canOpen, homePage } from "./utils/auth"

const PAGES: Page[] = ["login", "signup", "dashboard", "members", "classes", "membership", "timetable", "plans", "account", "users"]
const isProtected = (page: Page | null): page is ProtectedPage => page !== null && page !== "login" && page !== "signup"

/** The page named in the URL hash (#/members), or null when there is none. */
function readHash(): Page | null {
  const name = window.location.hash.replace(/^#\/?/, "")
  return PAGES.find((p) => p === name) ?? null
}

// No router library: the page lives in the URL hash, so reload and the back button work.
export default function App() {
  const { user, loading } = useAuth()
  const [requested, setRequested] = useState<Page | null>(readHash)

  useEffect(() => {
    const onChange = () => setRequested(readHash())
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [])

  // Only pages this person may open: logged-out visitors get login / sign up, everyone else their allowed pages.
  let page: Page
  if (!user) page = requested === "signup" ? "signup" : "login"
  else if (isProtected(requested)) page = canOpen(user.role, requested) ? requested : homePage(user.role)
  else page = homePage(user.role)

  // Keep the address bar in step with the page shown (for example after a redirect to login).
  useEffect(() => {
    if (loading) return
    if (window.location.hash !== `#/${page}`) window.history.replaceState(null, "", `#/${page}`)
    setRequested(page)
    // Runs again whenever the requested page changes, so a blocked page (#/users for a Gym Manager) is replaced too.
  }, [page, requested, loading])

  if (loading) return <p className="empty">Loading…</p>

  return (
    <AppLayout page={page}>
      {page === "login" && <LoginPage />}
      {page === "signup" && <SignupPage />}
      {page === "dashboard" && <DashboardPage />}
      {page === "members" && <HomePage />}
      {page === "classes" && <ClassesPage />}
      {page === "membership" && <MembershipPage />}
      {page === "timetable" && <TimetablePage />}
      {page === "plans" && <PlansPage />}
      {page === "account" && <AccountPage />}
      {page === "users" && <UsersPage />}
    </AppLayout>
  )
}
