import { useState } from "react"
import { gymToday } from "../utils/time"
import { saveFile } from "../utils/payment"
import { errorText } from "../utils/text"
import Icon from "./Icon"

interface Props {
  /** The file is called name-YYYY-MM-DD.csv. */
  name: string
  load: () => Promise<Blob>
  disabled?: boolean
  onError: (message: string) => void
}

// Downloads the rows of the list, with the filters it has now, as a CSV file.
export default function ExportButton({ name, load, disabled = false, onError }: Props) {
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    onError("")
    try {
      saveFile(await load(), `${name}-${gymToday()}.csv`)
    } catch (err) {
      onError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <button type="button" onClick={run} disabled={disabled || busy}>
      <Icon name="download" /> {busy ? "Exporting…" : "Export CSV"}
    </button>
  )
}
