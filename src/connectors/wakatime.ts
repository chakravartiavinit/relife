import type { Connector } from '@/core/types'
import { env } from '@/core/env'
import { emitDays, fetchJson, syncWindow } from './daily'

// WakaTime: time spent coding in your editor, per day, with the top language and project.
// The free plan keeps 14 days of history, so the first sync backfills 14 days; later ones the last 3.
// src/parsers/daily.ts turns each day into coding.minutes (Skills).

export type WakaDay = { date: string; minutes: number; language?: string; project?: string }

type Summary = {
  range: { date: string }
  grand_total: { total_seconds: number }
  languages?: { name: string; total_seconds: number }[]
  projects?: { name: string; total_seconds: number }[]
}

const top = (xs?: { name: string; total_seconds: number }[]) => xs?.filter((x) => x.total_seconds >= 60).sort((a, b) => b.total_seconds - a.total_seconds)[0]?.name

export const wakatime: Connector = {
  id: 'wakatime',
  name: 'WakaTime',
  category: 'skills',
  description: 'Time you spend coding in your editor each day, with your top language and project.',
  provides: ['Coding time', 'Languages', 'Projects'],
  fields: [{ env: 'WAKATIME_API_KEY', label: 'API key', secret: true, placeholder: 'waka_…', hint: 'wakatime.com → Settings → Account → API Key.' }],
  env: ['WAKATIME_API_KEY'],
  everyMinutes: 60,
  async sync(ctx) {
    const { tz, today, from } = syncWindow(ctx, 14)
    const auth = `Basic ${Buffer.from(env('WAKATIME_API_KEY')!.trim()).toString('base64')}`
    const q = new URLSearchParams({ start: from, end: today, timezone: tz })
    const { data } = await fetchJson<{ data: Summary[] }>(`https://wakatime.com/api/v1/users/current/summaries?${q}`, { headers: { Authorization: auth } })
    const days: WakaDay[] = data.map((s) => ({
      date: s.range.date,
      minutes: Math.round(s.grand_total.total_seconds / 60),
      language: top(s.languages),
      project: top(s.projects),
    }))
    await emitDays(ctx, 'wakatime', days)
    ctx.setCursor({ backfilled: true })
    ctx.log(`${days.length} days`)
  },
}
