import type { Connector } from '@/core/types'
import { env } from '@/core/env'
import { localDate } from '@/core/time'
import { dayMap, emitDays, fetchJson, fillDays, syncWindow } from './daily'
import { handleOf } from './net'

// Codewars: kata you complete, per day, from your public profile (no key). A kata counts once, on the day you
// first completed it. Honor is today's total only (Codewars keeps no history), so it is set on today.
// First sync backfills 90 days, later ones the last 3. src/parsers/daily.ts turns each day into cp.solved
// (source "codewars", added to problems solved on other sites) and codewars.honor.

export type CodewarsDay = { date: string; solved: number; honor?: number }

export type Kata = { completedAt: string }

type Completed = { totalPages: number; data: Kata[] }

// Codewars usernames are case sensitive: "G964" is a 404 where "g964" works.
const notFoundText = (name: string) => `No Codewars user “${name}”. Usernames are case sensitive, so copy it exactly.`

const blank = (date: string): CodewarsDay => ({ date, solved: 0 })

/** Pure: completed kata into days in the user's time zone. Exported for tests. */
export function codewarsDays(kata: Kata[], tz: string) {
  const { days, day } = dayMap(blank)
  for (const k of kata) if (Number.isFinite(Date.parse(k.completedAt))) day(localDate(new Date(k.completedAt), tz)).solved++
  return days
}

export const codewars: Connector = {
  id: 'codewars',
  name: 'Codewars',
  category: 'skills',
  description: 'Kata you complete on Codewars each day, counted as problems solved, and your honor. No key needed.',
  provides: ['Kata solved', 'Honor'],
  fields: [{ env: 'CODEWARS_USERNAME', label: 'Codewars username', placeholder: 'g964', hint: 'Your public username, from codewars.com/users/<name>.' }],
  env: ['CODEWARS_USERNAME'],
  everyMinutes: 60,
  async check(get) {
    const name = handleOf(get('CODEWARS_USERNAME'))
    await fetchJson(`https://www.codewars.com/api/v1/users/${encodeURIComponent(name)}`, {}, notFoundText(name))
  },
  async sync(ctx) {
    const { tz, today, from, backfilled } = syncWindow(ctx, 90)
    const name = handleOf(env('CODEWARS_USERNAME'))
    const api = `https://www.codewars.com/api/v1/users/${encodeURIComponent(name)}`
    const notFound = notFoundText(name)
    const profile = await fetchJson<{ honor?: number }>(api, {}, notFound)
    const kata: Kata[] = []
    // 200 a page, newest first, pages count from 0.
    for (let page = 0; page < 20; page++) {
      const r = await fetchJson<Completed>(`${api}/code-challenges/completed?page=${page}`, {}, notFound)
      kata.push(...r.data)
      const oldest = r.data.at(-1)
      if (!oldest || page + 1 >= r.totalPages || localDate(new Date(oldest.completedAt), tz) < from) break
    }
    const byDay = codewarsDays(kata, tz)
    const honor = profile.honor
    const todayDay = byDay.get(today) ?? blank(today)
    byDay.set(today, { ...todayDay, ...(typeof honor === 'number' ? { honor } : {}) })
    const days = fillDays(byDay.values(), from, today, blank, backfilled)
    await emitDays(ctx, 'codewars', days)
    ctx.setCursor({ backfilled: true })
    ctx.log(`${kata.length} kata on ${days.length} days`)
  },
}
