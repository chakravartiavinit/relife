// Small helpers for the connectors that read public profiles by username (GitHub, Codeforces, Lichess…).

const NOT_NAMES = new Set(['profile', 'users', 'user', 'u', 'member', 'members', 'people', '@'])

/**
 * A username from whatever a person pastes: "@name", "name/" or a profile link such as
 * https://codeforces.com/profile/tourist, https://lichess.org/@/name or leetcode.com/u/name/.
 */
export function handleOf(raw: string | undefined) {
  let s = (raw ?? '').trim()
  if (/^(https?:\/\/)?[\w-]+(\.[\w-]+)+\/\S/i.test(s)) {
    const parts = s.replace(/^https?:\/\//i, '').split(/[?#]/)[0].split('/').slice(1).filter(Boolean)
    s = parts.find((p) => !NOT_NAMES.has(p.toLowerCase())) ?? ''
    try { s = decodeURIComponent(s) } catch { /* keep as typed */ }
  }
  return s.replace(/^@+/, '').replace(/\/+$/, '').trim()
}

/** A timeout or a dropped connection, in words that say what happens next. */
export function friendly(e: unknown, url: string) {
  const host = new URL(url).hostname
  if (e instanceof Error && e.name === 'TimeoutError') return new Error(`${host} timed out. It will try again on the next sync.`)
  if (e instanceof TypeError) return new Error(`Network problem: couldn’t reach ${host}. It will try again on the next sync.`)
  return e
}

/** fetch that gives up after `ms` (a hung server must not hang the sync) and explains network trouble. */
export async function fetchT(url: string, init: RequestInit = {}, ms = 20_000) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(ms) })
  } catch (e) {
    throw friendly(e, url)
  }
}
