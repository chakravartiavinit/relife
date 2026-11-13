import { RRule, rrulestr, type RRuleSet } from 'rrule'
import { utcToWall, wallToUtc } from '@/core/time'

// Schedules store an RFC 5545 string whose DTSTART is *floating* local wall time
// (UTC fields = the user's clock). We expand in wall time, then convert to real instants,
// so "08:00 daily" stays 08:00 local across DST changes.

export type Freq = 'daily' | 'weekly' | 'monthly' | 'yearly'
export const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const
export type Weekday = (typeof WEEKDAYS)[number]

export type SimpleRule = {
  freq: Freq
  interval?: number // every N days/weeks/months
  times: string[] // 'HH:MM', at least one
  byweekday?: Weekday[] // weekly
  bymonthday?: number // monthly / yearly
  bymonth?: number // yearly, 1-12
  start: string // YYYY-MM-DD local
  until?: string // YYYY-MM-DD local (e.g. end of a medicine course)
  count?: number
}

const FREQ = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' } as const

/** One RRULE line per time of day, sharing DTSTART. Avoids BYHOUR×BYMINUTE cross products. */
export function buildRRule(r: SimpleRule): string {
  const times = r.times.length ? r.times : ['09:00']
  const dt = `${r.start.replaceAll('-', '')}T000000`
  const lines = [`DTSTART:${dt}`]
  for (const t of times) {
    const [h, m] = t.split(':').map(Number)
    const parts = [`FREQ=${FREQ[r.freq]}`, `INTERVAL=${r.interval ?? 1}`, `BYHOUR=${h}`, `BYMINUTE=${m}`, 'BYSECOND=0']
    if (r.freq === 'weekly' && r.byweekday?.length) parts.push(`BYDAY=${r.byweekday.join(',')}`)
    if ((r.freq === 'monthly' || r.freq === 'yearly') && r.bymonthday) parts.push(`BYMONTHDAY=${r.bymonthday}`)
    if (r.freq === 'yearly' && r.bymonth) parts.push(`BYMONTH=${r.bymonth}`)
    if (r.until) parts.push(`UNTIL=${r.until.replaceAll('-', '')}T235959`)
    if (r.count) parts.push(`COUNT=${r.count}`)
    lines.push(`RRULE:${parts.join(';')}`)
  }
  return lines.join('\n')
}

/** Best-effort reverse of buildRRule, for edit forms. */
export function parseSimple(rrule: string): SimpleRule {
  const set = rrulestr(rrule, { forceset: true }) as RRuleSet
  const rules = set.rrules()
  const o = rules[0]?.origOptions ?? {}
  const dt = o.dtstart ?? new Date()
  const freq = ({ [RRule.DAILY]: 'daily', [RRule.WEEKLY]: 'weekly', [RRule.MONTHLY]: 'monthly', [RRule.YEARLY]: 'yearly' } as Record<number, Freq>)[o.freq ?? RRule.DAILY] ?? 'daily'
  const times = rules.map((r) => {
    const h = [r.origOptions.byhour].flat()[0] ?? 9
    const m = [r.origOptions.byminute].flat()[0] ?? 0
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  })
  const byweekday = ([o.byweekday].flat().filter((x) => x != null) as { weekday: number }[])
    .map((w) => WEEKDAYS[typeof w === 'number' ? w : w.weekday])
  return {
    freq,
    interval: o.interval ?? 1,
    times,
    byweekday: byweekday.length ? byweekday : undefined,
    bymonthday: [o.bymonthday].flat()[0] ?? undefined,
    bymonth: [o.bymonth].flat()[0] ?? undefined,
    start: dt.toISOString().slice(0, 10),
    until: o.until ? o.until.toISOString().slice(0, 10) : undefined,
    count: o.count ?? undefined,
  }
}

/** Most reminders one routine may fire in a day. */
export const MAX_PER_DAY = 6
const ALLOWED_FREQ = new Set<number>([RRule.DAILY, RRule.WEEKLY, RRule.MONTHLY, RRule.YEARLY])

/**
 * Checks a rule that did not come from our own form (an AI proposal, an old stored suggestion) and returns it
 * anchored with a DTSTART on `startDay` (YYYY-MM-DD, local), or null when it is unusable. It must parse, repeat
 * daily or slower (never hourly, per minute or per second), fire at most MAX_PER_DAY times a day and have an
 * occurrence left. Without this, `FREQ=MINUTELY;BYHOUR=7` would pass for "Daily · 07:00" and ring 60 times a day.
 */
export function validateRRule(input: string, startDay: string): string | null {
  const text = input.trim()
  if (!text || text.length > 600) return null
  try {
    const rule = text.includes('DTSTART')
      ? text
      : `DTSTART:${startDay.replaceAll('-', '')}T000000\n${text.startsWith('RRULE:') ? text : `RRULE:${text}`}`
    const set = rrulestr(rule, { forceset: true }) as RRuleSet
    const rules = set.rrules()
    if (!rules.length || rules.length > MAX_PER_DAY || set.exrules().length || set.rdates().length || set.exdates().length) return null
    let perDay = 0
    for (const r of rules) {
      const o = r.options
      if (!ALLOWED_FREQ.has(o.freq)) return null
      perDay += o.byhour.length * o.byminute.length * o.bysecond.length
    }
    if (perDay > MAX_PER_DAY) return null
    if (!set.after(new Date(Date.UTC(1970, 0, 1)), true)) return null
    return rule
  } catch {
    return null
  }
}

/** Real instants of occurrences in [from, to] (inclusive). */
export function occurrencesBetween(rrule: string, from: Date, to: Date, tz: string): Date[] {
  const set = rrulestr(rrule, { forceset: true })
  return set.between(utcToWall(from, tz), utcToWall(to, tz), true).map((w) => wallToUtc(w, tz))
}

/** Next occurrence strictly after `after`. */
export function nextOccurrence(rrule: string, after: Date, tz: string): Date | null {
  const set = rrulestr(rrule, { forceset: true })
  const w = set.after(utcToWall(after, tz), false)
  return w ? wallToUtc(w, tz) : null
}

export function describe(rrule: string): string {
  try {
    const s = parseSimple(rrule)
    const every = s.interval && s.interval > 1 ? `Every ${s.interval} ${unit(s.freq)}s` : cap(s.freq)
    const days = s.freq === 'weekly' && s.byweekday?.length
      ? ` on ${s.byweekday.map((d) => d.charAt(0) + d.charAt(1).toLowerCase()).join(', ')}`
      : ''
    const md = (s.freq === 'monthly' || s.freq === 'yearly') && s.bymonthday ? ` on day ${s.bymonthday}` : ''
    const mo = s.freq === 'yearly' && s.bymonth
      ? ` of ${new Date(Date.UTC(2000, s.bymonth - 1, 1)).toLocaleString('en', { month: 'long', timeZone: 'UTC' })}`
      : ''
    return `${every}${days}${md}${mo} · ${s.times.join(', ')}`
  } catch {
    return rrule
  }
}

function unit(f: Freq) { return { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[f] }
function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1) }
