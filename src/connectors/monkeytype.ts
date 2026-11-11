import type { Connector } from '@/core/types'
import { env } from '@/core/env'
import { localDate } from '@/core/time'
import { dayMap, emitDays, fetchJson, fillDays, syncWindow } from './daily'

// Monkeytype: typing tests you take each day, minutes typed, and your average and best speed.
// Ape keys allow only a few result reads a day, so it syncs every 2 hours. First sync backfills 90 days.

export type TypingDay = { date: string; tests: number; minutes: number; wpm?: number; best?: number; accuracy?: number }

type Result = { wpm: number; acc: number; timestamp: number; testDuration: number }

const r1 = (n: number) => Math.round(n * 10) / 10

/** Pure: results into days in the user's time zone. Exported for tests. */
export function typingDays(results: Result[], tz: string) {
  const { days, day } = dayMap<TypingDay & { all: Result[] }>((date) => ({ date, tests: 0, minutes: 0, all: [] }))
  for (const x of results) day(localDate(new Date(x.timestamp), tz)).all.push(x)
  return [...days.values()].map(({ all, date }): TypingDay => ({
    date,
    tests: all.length,
    minutes: Math.round(all.reduce((s, x) => s + x.testDuration, 0) / 60),
    wpm: r1(all.reduce((s, x) => s + x.wpm, 0) / all.length),
    best: r1(Math.max(...all.map((x) => x.wpm))),
    accuracy: r1(all.reduce((s, x) => s + x.acc, 0) / all.length),
  }))
}

export const monkeytype: Connector = {
  id: 'monkeytype',
  name: 'Monkeytype',
  category: 'skills',
  description: 'Typing tests you take on Monkeytype: your speed, accuracy and minutes practised each day.',
  provides: ['Typing speed', 'Accuracy', 'Practice time'],
  fields: [{ env: 'MONKEYTYPE_APE_KEY', label: 'Ape key', secret: true, hint: 'monkeytype.com → Account settings → Ape keys → Generate, then switch it on.' }],
  env: ['MONKEYTYPE_APE_KEY'],
  everyMinutes: 120,
  async sync(ctx) {
    const { tz, today, from, backfilled } = syncWindow(ctx, 90)
    const since = Date.parse(`${from}T00:00:00Z`) - 86_400_000 // a day early covers any time zone
    const r = await fetchJson<{ data: Result[] }>(`https://api.monkeytype.com/results?onOrAfterTimestamp=${since}&limit=1000`, {
      headers: { Authorization: `ApeKey ${env('MONKEYTYPE_APE_KEY')!.trim()}` },
    })
    const days = fillDays(typingDays(r.data, tz), from, today, (date) => ({ date, tests: 0, minutes: 0 }), backfilled)
    const n = await emitDays(ctx, 'monkeytype', days)
    ctx.setCursor({ backfilled: true })
    ctx.log(`${r.data.length} tests on ${n} days`)
  },
}
