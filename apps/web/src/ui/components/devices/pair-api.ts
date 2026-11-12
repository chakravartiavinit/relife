'use client'

import type { ApiError } from '@relife/contract'

// The pairing calls a visitor's browser makes before it has a session (/signin and /pair). The cookie comes back on the response.

export async function postJson<T>(path: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: ApiError['error']; retryAfter: number | null }> {
  try {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', credentials: 'same-origin' })
    const json = await r.json().catch(() => null)
    if (r.ok) return { ok: true, data: json as T }
    const error = (json as ApiError | null)?.error ?? { code: 'unavailable' as const, message: 'ReLife didn’t answer. Try again.' }
    return { ok: false, error, retryAfter: Number(r.headers.get('retry-after')) || null }
  } catch {
    return { ok: false, error: { code: 'unavailable', message: 'Can’t reach ReLife. Is it running?' }, retryAfter: null }
  }
}

/** A `next` address from the query: a path on this site only, never another origin. */
export const safeNext = (n: string | null | undefined) => (n && n.startsWith('/') && !n.startsWith('//') && !n.includes('\\') ? n : '/')
