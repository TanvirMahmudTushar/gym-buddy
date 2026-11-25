import { useEffect, useState } from "react"

/** Something read from the address (such as an id), read again whenever the address changes. */
export function useHashValue<T>(read: () => T): T {
  const [value, setValue] = useState(read)
  useEffect(() => {
    const onChange = () => setValue(read())
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
    // `read` is a plain function of the address, so it never has to be watched.
  }, [])
  return value
}
