import { useState } from "react"
import { errorText } from "../utils/text"

/** Runs one action at a time and keeps whether it is running and why it failed. Resolves to true when it worked. */
export function useSave() {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setSaving(true)
    setError("")
    try {
      await action()
      return true
    } catch (err) {
      setError(errorText(err))
      return false
    } finally {
      setSaving(false)
    }
  }

  return { saving, error, setError, run }
}
