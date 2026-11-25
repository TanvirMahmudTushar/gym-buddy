// The address after #: the page and its options, such as #/members?filter=active&member=5.

/** The options after ?. */
export const hashParams = () => new URLSearchParams(window.location.hash.split("?")[1] ?? "")

/** An id from an option, or null when it is missing or not an id. */
export function hashId(name: string): number | null {
  const id = Number(hashParams().get(name))
  return Number.isInteger(id) && id > 0 ? id : null
}

/** A YYYY-MM-DD option, or "". */
export function hashDay(name: string): string {
  const value = hashParams().get(name) ?? ""
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""
}

/** A page's address with the options that are set. */
export function pageLink(page: string, options: Record<string, string | number | null | undefined> = {}): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(options)) if (value) params.set(key, String(value))
  const query = params.toString()
  return query ? `#/${page}?${query}` : `#/${page}`
}

/** Keep a page's options in the address, so a reload or a shared link shows the same. Adds no history entry. */
export const replaceHash = (link: string) => window.history.replaceState(null, "", link)
