import ChangePasswordForm from "../../components/ChangePasswordForm"

// Shown instead of every page after an admin reset the password: the API answers nothing else until a new one is set.
export default function ChoosePasswordPage() {
  return (
    <div className="column narrow">
      <ChangePasswordForm
        heading="Choose a new password"
        intro="An admin reset your password. Enter the temporary password you were given, then choose your own to keep using Gym Buddy."
        currentLabel="Temporary password"
      />
    </div>
  )
}
