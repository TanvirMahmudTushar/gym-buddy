import ChangePasswordForm from "../../components/ChangePasswordForm"
import PageHeader from "../../components/PageHeader"

// Shown instead of every page after an admin reset the password: the API answers nothing else until a new one is set.
export default function ChoosePasswordPage() {
  return (
    <div className="page">
      <PageHeader title="Choose a new password" subtitle="An admin reset your password. Enter the temporary one you were given, then choose your own." />
      <div className="split">
        <section className="card">
          <ChangePasswordForm currentLabel="Temporary password" />
        </section>
      </div>
    </div>
  )
}
