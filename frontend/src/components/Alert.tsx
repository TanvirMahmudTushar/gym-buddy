import type { ReactNode } from "react"

interface Props {
  kind?: "error" | "success" | "info"
  /** Nothing is shown while this is empty, so it can be rendered always. */
  children: ReactNode
}

// A message about what just happened. Screen readers hear an error at once and the rest when they are free.
export default function Alert({ kind = "error", children }: Props) {
  if (!children) return null
  return (
    <p className={`alert ${kind}`} role={kind === "error" ? "alert" : "status"}>
      {children}
    </p>
  )
}
