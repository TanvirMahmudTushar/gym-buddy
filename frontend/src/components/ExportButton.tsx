import { useState } from "react"
import { gymToday } from "../utils/time"
import { saveFile } from "../utils/payment"
import { errorText } from "../utils/text"
import Icon from "./Icon"

// A CSV holds at most this many rows (backend EXPORT_LIMIT).
const EXPORT_LIMIT = 10_000

interface Props {
  /** The file is called name-YYYY-MM-DD.csv. */
  name: string
  load: () => Promise<Blob>
  /** How many rows the list has. */
  total: number
  onError: (message: string) => void
}

// Downloads the rows of the list, with the filters it has now, as a CSV file.
export default function ExportButton({ name, load, total, onError }: Props) {
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
    <>
      {total > EXPORT_LIMIT && (
        <span className="hint">
          The CSV holds the first {EXPORT_LIMIT.toLocaleString("en-US")} of {total.toLocaleString("en-US")} rows; narrow the filters for the rest.
        </span>
      )}
      <button type="button" onClick={run} disabled={total === 0 || busy}>
        <Icon name="download" /> {busy ? "Exporting…" : "Export CSV"}
      </button>
    </>
  )
}
