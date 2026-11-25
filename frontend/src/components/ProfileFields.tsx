import type { ProfileErrors, ProfileForm } from "../utils/profile"
import { EARLIEST_BIRTH_DATE } from "../utils/profile"
import { gymToday } from "../utils/time"
import FieldError from "./FieldError"

interface Props {
  /** Prefix for the input ids, so two forms on one page never share one. */
  idPrefix: string
  form: ProfileForm
  errors: ProfileErrors
  onChange: (key: keyof ProfileForm, value: string) => void
}

// Phone, date of birth and emergency contact: four cells of a .fields grid, used on My account and in Edit member.
export default function ProfileFields({ idPrefix, form, errors, onChange }: Props) {
  const id = (name: string) => `${idPrefix}-${name}`
  const input = (key: keyof ProfileForm) => ({
    id: id(key),
    value: form[key],
    onChange: (e: { target: { value: string } }) => onChange(key, e.target.value),
  })

  return (
    <>
      <div className="field">
        <label htmlFor={id("phone")}>Phone</label>
        <input {...input("phone")} type="tel" maxLength={20} autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor={id("date_of_birth")}>Date of birth</label>
        <input {...input("date_of_birth")} type="date" min={EARLIEST_BIRTH_DATE} max={gymToday()} />
        <FieldError>{errors.date_of_birth}</FieldError>
      </div>
      <div className="field">
        <label htmlFor={id("emergency_contact_name")}>Emergency contact</label>
        <input {...input("emergency_contact_name")} maxLength={100} autoComplete="off" placeholder="Rina (mother)" />
        <FieldError>{errors.emergency_contact}</FieldError>
      </div>
      <div className="field">
        <label htmlFor={id("emergency_contact_phone")}>Emergency phone</label>
        <input {...input("emergency_contact_phone")} type="tel" maxLength={20} autoComplete="off" />
      </div>
    </>
  )
}
