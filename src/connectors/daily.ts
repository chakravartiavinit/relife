import { createHash } from 'node:crypto'
import type { ConnectorCtx } from '@/core/types'
import { addDays, localDate } from '@/core/time'
import { fetchT } from './net'

// Shared by the connectors that send one summary per day (WakaTime, Strava, Todoist, Last.fm, Steam…).

/** The days to fetch: a long backfill on the first sync, then just the last few days. */
export function syncWindow(ctx: ConnectorCtx, backfillDays: number, recentDays = 3) {
  const tz = ctx.user.timezone
  const today = localDate(new Date(), tz)
  const backfilled = !!(ctx.cursor as { backfilled?: boolean } | null)?.backfilled
  return { tz, today, backfilled, from: addDays(today, -(backfilled ? recentDays : backfillDays - 1)) }
}

/** One raw event per day. The id includes the numbers, so a day is parsed again only when it changes. */
export async function emitDays(ctx: ConnectorCtx, source: string, days: Iterable<{ date: string }>) {
  const now = new Date()
  for (const d of days) {
    const hash = createHash('sha256').update(JSON.stringify(d)).digest('hex').slice(0, 12)
    await ctx.emit({ source, externalId: `${d.date}:${hash}`, at: now, body: d })
  }
}

/** fetch with a 30s limit and messages a person can act on: "timed out" and "Network problem" both mean "try again later". */
export function request(url: string, init: RequestInit = {}): Promise<Response> {
  return fetchT(url, { ...init, headers: { 'User-Agent': 'ReLife (self-hosted life tracker)', Accept: 'application/json', ...init.headers } }, 30_000)
}

/** The status errors every service shares, with words for the Connectors page. */
export function checkStatus(res: Response, notFound: string) {
  if (res.status === 401 || res.status === 403) throw new Error('The key was rejected. Check it on Connectors, or make a new one.')
  if (res.status === 404) throw new Error(notFound)
  if (res.status === 429) throw new Error('Rate limited. It will try again on the next sync.')
}

/** fetch + JSON with errors a person can act on, shown on the Connectors page. A 204 answers `undefined`. */
export async function fetchJson<T>(url: string, init: RequestInit = {}, notFound = 'Not found. Check the username.'): Promise<T> {
  const res = await request(url, init)
  checkStatus(res, notFound)
  if (!res.ok) {
    // Keep the service's own words ("Malformed ApeKey"), so a connector can turn them into advice.
    const said = await res.json().then((b: { message?: unknown; error?: unknown }) => b?.message ?? b?.error, () => null)
    throw new Error(`HTTP ${res.status}${typeof said === 'string' && said ? `: ${said.slice(0, 200)}` : ''}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

/** `.catch(rejectedAs('…'))`: swaps the generic "key was rejected" for advice naming the service and where to get a new key. */
export const rejectedAs = (advice: string, also?: RegExp) => (e: Error): never => {
  throw new Error(e.message.includes('rejected') || also?.test(e.message) ? advice : e.message)
}

/**
 * Adds empty days so a day with nothing done counts as zero, not as "no data". The first backfill
 * starts at the first day with data (before that you may not have used the service); later syncs
 * fill the whole window. Sorted by date.
 */
export function fillDays<T extends { date: string }>(days: Iterable<T>, from: string, today: string, blank: (date: string) => T, wholeWindow: boolean) {
  const byDate = new Map([...days].map((d) => [d.date, d]))
  const first = [...byDate.keys()].sort()[0]
  const start = wholeWindow ? from : first
  if (start) for (let d = start; d <= today; d = addDays(d, 1)) if (!byDate.has(d)) byDate.set(d, blank(d))
  return [...byDate.values()].filter((d) => d.date >= from && d.date <= today).sort((a, b) => a.date.localeCompare(b.date))
}

/** A Map of days, created on first touch. */
export function dayMap<T extends { date: string }>(blank: (date: string) => T) {
  const days = new Map<string, T>()
  return { days, day: (date: string) => days.get(date) ?? days.set(date, blank(date)).get(date)! }
}
