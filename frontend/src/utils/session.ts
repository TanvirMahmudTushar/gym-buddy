// Display helpers for the session list.

/** "Chrome on Windows" from a User-Agent text. Rough on purpose: it only has to tell my own browsers apart. */
export function describeBrowser(userAgent: string | null): string {
  if (!userAgent) return "Unknown browser"
  // Order matters: Edge and Opera also say Chrome, Chrome also says Safari, Android also says Linux,
  // and iPhones also say Mac OS X.
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Chrome\//.test(userAgent)
          ? "Chrome"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : null
  const os = /Windows/.test(userAgent)
    ? "Windows"
    : /Android/.test(userAgent)
      ? "Android"
      : /iPhone|iPad|iPod/.test(userAgent)
        ? "iOS"
        : /Mac OS X/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : null
  // Not a browser (for example a script): show the program's name, such as "curl/8.4.0".
  if (!browser) return userAgent.split(" ")[0]
  return os ? `${browser} on ${os}` : browser
}
