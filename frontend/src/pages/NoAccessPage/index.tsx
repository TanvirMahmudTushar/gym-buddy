import PageHeader from "../../components/PageHeader"
import { useAuth } from "../../context/AuthContext"
import { homePage, roleLabel } from "../../utils/auth"

// Shown instead of a page the person's role may not open. The API refuses its data as well (403).
export default function NoAccessPage() {
  const { user } = useAuth()
  if (!user) return null
  return (
    <div className="page">
      <PageHeader title="No access" />
      <section className="card">
        <p>
          This page is not for the {roleLabel(user.role)} role. If you need it, ask an admin to change your role.
        </p>
        <div className="actions">
          <a className="button primary" href={`#/${homePage(user)}`}>
            Go to my start page
          </a>
        </div>
      </section>
    </div>
  )
}
