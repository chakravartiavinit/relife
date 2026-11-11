// Small helpers for the connectors that read public profiles by username (GitHub, Codeforces, Lichess…).

import { setTimeout as sleep } from 'node:timers/promises'

const NOT_NAMES = new Set(['profile', 'users', 'user', 'u', 'id', 'member', 'members', 'people', '@'])

/**
 * A username from whatever a person pastes: "@name", "name/" or a profile link such as
 * https://codeforces.com/profile/tourist, https://lichess.org/@/name, leetcode.com/u/name/ or steamcommunity.com/id/name.
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

/** fetch that gives up after `ms` (a hung server must not hang the sync) and words a timeout or a dropped connection as "try again". */
export async function fetchT(url: string, init: RequestInit = {}, ms = 20_000) {
  try {
    const timeout = AbortSignal.timeout(ms)
    return await fetch(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout })
  } catch (e) {
    const host = new URL(url).hostname
    if (e instanceof Error && e.name === 'TimeoutError') throw new Error(`${host} timed out. It will try again on the next sync.`)
    if (e instanceof TypeError) throw new Error(`Network problem: couldn’t reach ${host}. It will try again on the next sync.`)
    throw e
  }
}

/** Runs `fn`; if it fails with a message matching `again` (a busy server), waits `ms` and runs it once more. */
export async function retryOnce<T>(fn: () => Promise<T>, again: RegExp, ms: number): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (!again.test((e as Error).message)) throw e
    await sleep(ms)
    return fn()
  }
}
