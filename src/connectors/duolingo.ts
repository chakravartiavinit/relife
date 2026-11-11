import type { Connector } from '@/core/types'
import { env } from '@/core/env'
import { addDays, localDate } from '@/core/time'
import { addGain, type TotalCursor } from '@/domain/running-total'
import { emitDays, fetchJson, pastedName, rejectedAs } from './daily'

// Duolingo from your public username: no key. The public profile has your total XP and streak, not XP
// per day, so each sync adds the gain since the last one (src/domain/running-total.ts). XP per day starts
// on the day you connect; the streak is right from the first sync.
// ponytail: Duolingo has no official API; this is the endpoint its own web app reads. If it changes,
// the sync shows an error rather than wrong numbers.

/** xp is missing on the first sync (unknown); streak only on today. */
export type DuolingoDay = { date: string; xp?: number; streak?: number; practised?: boolean; course?: string }

type Profile = {
  users: {
    totalXp: number
    streak: number
    streakData?: { currentStreak?: { endDate?: string } | null }
    currentCourseId?: string
    courses?: { id: string; title: string }[]
  }[]
}

/**
 * The day new XP belongs to. Duolingo says which day the streak was last extended: if that's yesterday,
 * XP gained since the last sync was earned last night (after the laptop's last sync), not today.
 * Exported for tests.
 */
export function xpDay(today: string, lastPractised: string | undefined) {
  return lastPractised === addDays(today, -1) ? lastPractised : today
}

const NOT_FOUND = 'Username not found. Use the name on your Duolingo profile (duolingo.com/profile/<name>), not your email.'

async function profile(input: string) {
  const name = encodeURIComponent(pastedName(input, 'profile'))
  const r = await fetchJson<Profile>(`https://www.duolingo.com/2017-06-30/users?username=${name}`) // a `fields` filter makes it return {}
    .catch(rejectedAs('Duolingo blocked this network (HTTP 403). It will try again on the next sync.'))
  const u = r.users?.[0]
  if (!u || typeof u.totalXp !== 'number') throw new Error(NOT_FOUND)
  return u
}

export const duolingo: Connector = {
  id: 'duolingo',
  name: 'Duolingo',
  category: 'skills',
  description: 'Your Duolingo XP each day and your streak, from your public profile. No key or login needed.',
  provides: ['Daily XP', 'Streak'],
  fields: [{ env: 'DUOLINGO_USERNAME', label: 'Duolingo username', placeholder: 'luis', hint: 'Your public username, from your profile page. No key or login needed.' }],
  env: ['DUOLINGO_USERNAME'],
  everyMinutes: 60,
  async check(get) {
    await profile(get('DUOLINGO_USERNAME')!)
  },
  async sync(ctx) {
    const u = await profile(env('DUOLINGO_USERNAME')!)
    const today = localDate(new Date(), ctx.user.timezone)
    const prev = (ctx.cursor as { total?: TotalCursor } | null)?.total
    const total = addGain(prev, u.totalXp, xpDay(today, u.streakData?.currentStreak?.endDate), today)
    const course = u.courses?.find((c) => c.id === u.currentCourseId)?.title
    const days: DuolingoDay[] = Object.entries(total.days).map(([date, xp]) => ({ date, xp }))
    // The streak is today's number, so it only goes on today.
    // Duolingo's own word on whether today's lesson is done, for the streak alert.
    const now = { streak: u.streak, practised: u.streakData?.currentStreak?.endDate === today, course }
    const todayRow = days.find((d) => d.date === today)
    if (todayRow) Object.assign(todayRow, now)
    else days.push({ date: today, ...now }) // first sync: XP unknown
    await emitDays(ctx, 'duolingo', days)
    ctx.setCursor({ total: { last: total.last, days: total.days } })
    ctx.log(`streak ${u.streak}${total.known ? `, ${total.days[today]} XP today` : ', XP counting starts now'}`)
  },
}
