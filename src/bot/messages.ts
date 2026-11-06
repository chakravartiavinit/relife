import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { esc, type Button } from '@/core/notify'
import { dayAgenda, upcomingPayments, type Schedule, type ScheduleMeta } from '@/core/schedules'
import { formatDay, formatTime, localDate } from '@/core/time'
import type { User } from '@/core/user'
import { formatMoney, formatNumber } from '@/domain/money'

const KIND_ICON: Record<Schedule['kind'], string> = { routine: '🔁', medicine: '💊', subscription: '💳', bill: '🧾', renewal: '📄' }

export function isPayment(s: Schedule) {
  return s.kind === 'subscription' || s.kind === 'bill' || s.kind === 'renewal'
}

export async function goalValue(user: User, slug: string, day: string) {
  const [t] = await db.select().from(schema.trackers).where(and(eq(schema.trackers.userId, user.id), eq(schema.trackers.slug, slug)))
  if (!t) return 0
  const rows = await db.select().from(schema.entries).where(and(eq(schema.entries.trackerId, t.id), eq(schema.entries.localDate, day)))
  return rows.reduce((s, r) => s + r.value, 0)
}

/** Text + buttons for one reminder. `rid` is the reminders row id used in callback data. */
export async function reminderMessage(user: User, s: Schedule, occurrence: Date, rid: string): Promise<{ text: string; buttons: Button[][] }> {
  const meta = s.meta as ScheduleMeta
  const time = formatTime(occurrence, user.timezone)
  const snooze = { text: '⏰ +30m', data: `r:z:${rid}` }

  if (isPayment(s)) {
    const day = localDate(occurrence, user.timezone)
    const days = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${localDate(new Date(), user.timezone)}T00:00:00Z`)) / 86_400_000)
    const when = days <= 0 ? 'due today' : days === 1 ? 'due tomorrow' : `due in ${days} days (${formatDay(day)})`
    const amount = s.amount ? ` · ${esc(formatMoney(s.amount, s.currency ?? user.baseCurrency))}` : ''
    return { text: `${KIND_ICON[s.kind]} <b>${esc(s.name)}</b>${amount}\n${when}`, buttons: [[{ text: '✅ Paid', data: `r:d:${rid}` }, snooze]] }
  }

  if (meta.trackerSlug && s.target) {
    const step = meta.step ?? Math.max(1, Math.round(s.target / 8))
    const value = await goalValue(user, meta.trackerSlug, localDate(occurrence, user.timezone))
    const unit = s.unit ? ` ${esc(s.unit)}` : ''
    return {
      text: `💧 <b>${esc(s.name)}</b>\n${formatNumber(value)} / ${formatNumber(s.target)}${unit}`,
      buttons: [[{ text: `+${formatNumber(step)}${unit}`, data: `r:+:${rid}` }, snooze]],
    }
  }

  const detail = [time, meta.dose, s.kind === 'medicine' && typeof meta.stock === 'number' ? `${meta.stock} left` : null, meta.notes]
    .filter(Boolean).map((x) => esc(String(x))).join(' · ')
  return {
    text: `${KIND_ICON[s.kind]} <b>${esc(s.name)}</b>\n${detail}`,
    buttons: [[{ text: '✅ Done', data: `r:d:${rid}` }, { text: '⏭ Skip', data: `r:s:${rid}` }, snooze]],
  }
}

/** Compact /today summary. */
export async function todayText(user: User, now = new Date()) {
  const day = localDate(now, user.timezone)
  const [agenda, payments] = await Promise.all([dayAgenda(user, day, now), upcomingPayments(user, now)])
  const lines: string[] = [`<b>${esc(formatDay(day, { weekday: 'long', day: 'numeric', month: 'long' }))}</b>`]

  const goals = new Map<string, Schedule>()
  const rows: string[] = []
  for (const i of agenda) {
    const s = i.schedule
    const meta = s.meta as ScheduleMeta
    if (isPayment(s)) continue
    if (meta.trackerSlug && s.target) { goals.set(s.id, s); continue }
    const mark = i.status === 'done' ? '✅' : i.status === 'skipped' ? '⏭' : i.status === 'missed' ? '⚠️' : '▫️'
    rows.push(`${mark} ${formatTime(i.occurrence, user.timezone)} ${esc(s.name)}`)
  }
  for (const s of goals.values()) {
    const v = await goalValue(user, (s.meta as ScheduleMeta).trackerSlug!, day)
    lines.push(`💧 ${esc(s.name)}: ${formatNumber(v)} / ${formatNumber(s.target!)}${s.unit ? ` ${esc(s.unit)}` : ''}`)
  }
  if (rows.length) {
    const done = agenda.filter((i) => i.status === 'done' && !isPayment(i.schedule) && !goals.has(i.schedule.id)).length
    lines.push('', `<b>Routines</b> · ${done}/${rows.length}`, ...rows)
  } else {
    lines.push('', 'Nothing scheduled today.')
  }
  const due = payments.filter((p) => p.daysLeft <= 7)
  if (due.length) {
    lines.push('', '<b>Due this week</b>')
    for (const p of due) {
      const when = p.daysLeft === 0 ? 'today' : p.daysLeft === 1 ? 'tomorrow' : `in ${p.daysLeft}d`
      lines.push(`💳 ${esc(p.schedule.name)}${p.amount ? ` ${esc(formatMoney(p.amount, p.currency ?? user.baseCurrency))}` : ''} · ${when}`)
    }
  }
  return lines.join('\n')
}

export const HELP = [
  '<b>ReLife</b>',
  '/today: your day at a glance',
  '/log water 250 · /log mood 4',
  '/spent 120 chai · /spent 20 usd claude',
  '/sleep and /wake: log sleep',
  '/ask how much did I spend on Zepto this month?',
  '',
  'Plain messages work too: “water 500”, “spent 80 auto”.',
].join('\n')
