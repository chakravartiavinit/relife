import type { Connector } from '@/core/types'
import { env } from '@/core/env'
import { localDate } from '@/core/time'
import { todayFromTotal, type TotalCursor } from '@/domain/running-total'
import { emitDays, fetchJson } from './daily'

// Duolingo from your public username: no key. The public profile has your total XP and streak, not XP
// per day, so each sync compares the total with the last one (src/domain/running-total.ts). XP per day
// starts on the day you connect; the streak is right from the first sync.
// ponytail: Duolingo has no official API; this is the endpoint its own web app reads. If it changes,
// the sync shows an error rather than wrong numbers.

export type DuolingoDay = { date: string; xp?: number; streak: number; practised: boolean; course?: string }

type Profile = {
  users: {
    totalXp: number
    streak: number
    streakData?: { currentStreak?: { endDate?: string } | null }
    currentCourseId?: string
    courses?: { id: string; title: string }[]
  }[]
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
  async sync(ctx) {
    const name = encodeURIComponent(env('DUOLINGO_USERNAME')!.trim())
    const r = await fetchJson<Profile>(`https://www.duolingo.com/2017-06-30/users?username=${name}`) // a `fields` filter makes it return {}
    const u = r.users?.[0]
    if (!u || typeof u.totalXp !== 'number') throw new Error('Username not found. Check the spelling on your Duolingo profile.')
    const today = localDate(new Date(), ctx.user.timezone)
    const { value, cursor } = todayFromTotal((ctx.cursor as { total?: TotalCursor } | null)?.total, u.totalXp, today)
    const day: DuolingoDay = {
      date: today,
      xp: value ?? undefined,
      streak: u.streak,
      // Duolingo's day can differ from yours by a few hours; it's the best signal the profile gives.
      practised: (value ?? 0) > 0 || u.streakData?.currentStreak?.endDate === today,
      course: u.courses?.find((c) => c.id === u.currentCourseId)?.title,
    }
    await emitDays(ctx, 'duolingo', [day])
    ctx.setCursor({ total: cursor })
    ctx.log(`streak ${u.streak}${value == null ? ', XP counting starts now' : `, ${value} XP today`}`)
  },
}
