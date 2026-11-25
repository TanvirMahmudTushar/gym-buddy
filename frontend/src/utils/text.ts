// Small text helpers.

export const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong")

/** "1 member", "3 members"; pass the plural when adding an s is not enough. */
export const count = (n: number, singular: string, plural = `${singular}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? singular : plural}`

/** "AR" for Ayesha Rahman. */
export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("")
