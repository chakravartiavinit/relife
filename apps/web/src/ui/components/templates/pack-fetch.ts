import { PACK_FETCH_LIMIT, normalizePackUrl } from '@/domain/pack-source'

// Opening a pack from a link, in the browser. The server never fetches an address a person typed. https only, no
// cookies, no referrer, a time limit and a size limit (the pack format's 64 KB), so a bad link cannot do more than fail.

export const LINK_FAILED = 'That link could not be opened. Check it, or download the file and choose it instead.'
export const TOO_BIG = 'This pack is larger than 64 KB.'

/** The text behind a link, or a message meant for the person. */
export async function fetchText(input: string, ms = 15_000): Promise<{ ok: true; text: string; host: string } | { ok: false; error: string }> {
  const u = normalizePackUrl(input, window.location.origin)
  if (!u.ok) return u
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), ms)
  try {
    const res = await fetch(u.url, { credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'follow', signal: ac.signal, cache: 'no-store' })
    // A redirect must not lead off the allow-list.
    const landed = normalizePackUrl(res.url || u.url, window.location.origin)
    if (!landed.ok) return { ok: false, error: landed.error }
    if (!res.ok) return { ok: false, error: res.status === 404 ? 'Nothing was found at that link.' : LINK_FAILED }
    const declared = Number(res.headers.get('content-length'))
    if (declared > PACK_FETCH_LIMIT) return { ok: false, error: TOO_BIG }
    const reader = res.body?.getReader()
    if (!reader) return { ok: false, error: LINK_FAILED }
    const chunks: Uint8Array[] = []
    let size = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > PACK_FETCH_LIMIT) { await reader.cancel(); return { ok: false, error: TOO_BIG } }
      chunks.push(value)
    }
    const all = new Uint8Array(size)
    let at = 0
    for (const c of chunks) { all.set(c, at); at += c.length }
    return { ok: true, text: new TextDecoder().decode(all), host: landed.host }
  } catch {
    return { ok: false, error: LINK_FAILED }
  } finally {
    clearTimeout(timer)
  }
}
