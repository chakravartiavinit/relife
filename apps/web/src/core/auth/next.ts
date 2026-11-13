/**
 * A `next` address (where to go after signing in) from a query string or a redirect: a path on this site, or '/'.
 * Browsers parse the address the same way a link would, so the check does too: strip tabs and newlines, turn `\` into
 * `/`, resolve against the site, and require the same origin. `//evil.example`, `/\evil.example`,
 * `/<tab>/evil.example` and `https://evil.example` all resolve elsewhere and come back as '/'.
 */
export function safeNext(n: string | null | undefined, origin: string): string {
  if (!n) return '/'
  try {
    const base = new URL(origin)
    const u = new URL(n, base)
    if (u.origin !== base.origin) return '/'
    // Dot segments can leave a path that begins `//`, which a browser reads as another site when it is used as an address.
    const out = u.pathname + u.search + u.hash
    return out.startsWith('//') ? '/' : out
  } catch {
    return '/'
  }
}
