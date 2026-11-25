import { useEffect, useState } from "react"
import Alert from "./components/Alert"
import ErrorBoundary from "./components/ErrorBoundary"
import { useAuth } from "./context/AuthContext"
import AppLayout from "./layouts/AppLayout"
import AccountPage from "./pages/AccountPage"
import ActivityPage from "./pages/ActivityPage"
import AnnouncementsPage from "./pages/AnnouncementsPage"
import AttendancePage from "./pages/AttendancePage"
import ChoosePasswordPage from "./pages/ChoosePasswordPage"
import ClassesPage from "./pages/ClassesPage"
import DashboardPage from "./pages/DashboardPage"
import EquipmentPage from "./pages/EquipmentPage"
import ExpensesPage from "./pages/ExpensesPage"
import LoginPage from "./pages/LoginPage"
import MembersPage from "./pages/MembersPage"
import MembershipPage from "./pages/MembershipPage"
import MyClassesPage from "./pages/MyClassesPage"
import MyClientsPage from "./pages/MyClientsPage"
import NoAccessPage from "./pages/NoAccessPage"
import PaymentsPage from "./pages/PaymentsPage"
import PlansPage from "./pages/PlansPage"
import SecurityPage from "./pages/SecurityPage"
import SignupPage from "./pages/SignupPage"
import TimetablePage from "./pages/TimetablePage"
import TrainingPage from "./pages/TrainingPage"
import UsersPage from "./pages/UsersPage"
import { PAGE_TITLES, type Page, type ProtectedPage, canOpen, homePage } from "./utils/auth"

const PAGES: Record<ProtectedPage, () => React.ReactNode> = {
  dashboard: DashboardPage,
  members: MembersPage,
  attendance: AttendancePage,
  payments: PaymentsPage,
  classes: ClassesPage,
  training: TrainingPage,
  equipment: EquipmentPage,
  announcements: AnnouncementsPage,
  plans: PlansPage,
  expenses: ExpensesPage,
  users: UsersPage,
  activity: ActivityPage,
  security: SecurityPage,
  "my-classes": MyClassesPage,
  clients: MyClientsPage,
  membership: MembershipPage,
  timetable: TimetablePage,
  account: AccountPage,
}

/** The page part of the URL hash: "members" for #/members?filter=expiring_soon. */
const hashPage = () => window.location.hash.replace(/^#\/?/, "").split("?")[0]

/** The page named in the URL hash (#/members), or null when there is none or it does not exist. */
function readHash(): Page | null {
  const name = hashPage()
  return name in PAGE_TITLES ? (name as Page) : null
}

// No router library: the page lives in the URL hash, so reload and the back button work.
export default function App() {
  const { user, loading, startError, retryStart } = useAuth()
  const [requested, setRequested] = useState<Page | null>(readHash)

  useEffect(() => {
    const onChange = () => setRequested(readHash())
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [])

  // Logged-out visitors get Log in or Sign up, whatever the address says; everyone else the page they asked for.
  let page: Page
  if (!user) page = requested === "signup" ? "signup" : "login"
  else if (requested === null || requested === "login" || requested === "signup") page = homePage(user)
  else page = requested

  // Keep the address bar in step with the page shown (for example after a redirect to Log in).
  useEffect(() => {
    if (loading || startError) return
    // Only the page part is compared, so a page's own options after ? (such as a list filter) are kept.
    if (hashPage() !== page) window.history.replaceState(null, "", `#/${page}`)
    setRequested(page)
  }, [page, loading, startError])

  useEffect(() => {
    document.title = `${PAGE_TITLES[page]} · Gym Buddy`
    window.scrollTo(0, 0)
  }, [page])

  if (loading) return <p className="empty">Loading…</p>

  if (startError)
    return (
      <main className="auth">
        <section className="card">
          <h1>Gym Buddy</h1>
          <Alert>{startError}</Alert>
          <button type="button" className="primary" onClick={retryStart}>
            Try again
          </button>
        </section>
      </main>
    )

  if (!user) return page === "signup" ? <SignupPage /> : <LoginPage />

  // After an admin reset the password, nothing else opens until a new one is chosen (the API refuses it too).
  if (user.must_change_password)
    return (
      <AppLayout page="account" locked>
        <ChoosePasswordPage />
      </AppLayout>
    )

  // The guard: the same permissions the API checks decide whether the page is shown at all.
  const open = page !== "login" && page !== "signup" && canOpen(user, page)
  const PageContent = open ? PAGES[page as ProtectedPage] : NoAccessPage
  return (
    <AppLayout page={page}>
      <ErrorBoundary key={page}>
        <PageContent />
      </ErrorBoundary>
    </AppLayout>
  )
}
