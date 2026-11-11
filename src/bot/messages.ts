import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { esc, type Button } from '@/core/notify'
import { dayAgenda, upcomingPayments, type Schedule, type ScheduleMeta } from '@/core/schedules'
import { formatDay, formatTime, localDate } from '@/core/time'
import type { User } from '@/core/user'
import { totalXp } from '@/core/xp'
import { formatMoney, formatNumber } from '@/domain/money'
import { levelFor, titleFor } from '@/domain/xp'
import { systemBoard } from '@/core/system'
import { utcToWall } from '@/core/time'
import { xpSummary } from '@/core/xp'
import { freezesHeld } from '@/core/quests'
import { questLine, questLog } from './system-ui'
import { bar, currentStreak, head, pct } from './ui'

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

/** How much one tap adds to a quantity goal (water): an eighth of the target unless set. */
export function goalStep(s: Schedule) {
  return (s.meta as ScheduleMeta).step ?? Math.max(1, Math.round((s.target ?? 8) / 8))
}

const later = (rid: string): Button => ({ text: '⏰ Later', data: `r:z:${rid}` })

/** Text + buttons for one reminder. `rid` is the reminders row id used in callback data. */
export async function reminderMessage(user: User, s: Schedule, occurrence: Date, rid: string): Promise<{ text: string; buttons: Button[][] }> {
  const meta = s.meta as ScheduleMeta
  const time = formatTime(occurrence, user.timezone)

  if (isPayment(s)) {
    const day = localDate(occurrence, user.timezone)
    const days = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${localDate(new Date(), user.timezone)}T00:00:00Z`)) / 86_400_000)
    const when = days <= 0 ? 'Due today' : days === 1 ? `Due tomorrow · ${formatDay(day)}` : `Due in ${days} days · ${formatDay(day)}`
    const title = s.amount ? `${s.name} · ${formatMoney(s.amount, s.currency ?? user.baseCurrency)}` : s.name
    return { text: head(KIND_ICON[s.kind], title, when), buttons: [[{ text: '✅ Paid', data: `r:d:${rid}` }], [later(rid)]] }
  }

  if (meta.trackerSlug && s.target) {
    const step = goalStep(s)
    const value = await goalValue(user, meta.trackerSlug, localDate(occurrence, user.timezone))
    const unit = s.unit ? ` ${s.unit}` : ''
    const r = value / s.target
    const reached = value >= s.target
    return {
      text: [
        head(reached ? '🎉' : '💧', s.name, reached ? 'Goal reached' : `${time} check-in`),
        `${bar(r)} ${pct(r)}`,
        `<b>${formatNumber(value)}</b> / ${formatNumber(s.target)}${esc(unit)}`,
      ].join('\n'),
      buttons: reached
        ? [[{ text: `+${formatNumber(step)}${unit}`, data: `r:p1:${rid}` }]]
        : [[{ text: `+${formatNumber(step)}${unit}`, data: `r:p1:${rid}` }, { text: `+${formatNumber(step * 2)}${unit}`, data: `r:p2:${rid}` }], [later(rid)]],
    }
  }

  const stock = s.kind === 'medicine' && typeof meta.stock === 'number' ? meta.stock : null
  const detail = [time, meta.dose, stock != null ? `${stock} left` : null, meta.notes].filter(Boolean).join(' · ')
  return {
    text: head(KIND_ICON[s.kind], s.name, detail) + (stock != null && stock <= 5 ? '\n⚠️ Running low. Time to restock.' : ''),
    buttons: [[{ text: '✅ Done', data: `r:d:${rid}` }], [later(rid), { text: '⏭ Skip', data: `r:s:${rid}` }]],
  }
}

/** A reminder after it was answered: struck through, with when and what it earned, and an Undo. */
export function reminderAnswered(user: User, s: Schedule, status: 'done' | 'skipped', xpLine: string) {
  const verb = status === 'skipped' ? 'Skipped' : isPayment(s) ? 'Paid' : 'Done'
  const meta = [`${verb} at ${formatTime(new Date(), user.timezone)}`, xpLine].filter(Boolean).join(' · ')
  return `${status === 'done' ? '✅' : '⏭'} <s>${esc(s.name)}</s>\n<i>${esc(meta)}</i>`
}

/** Reminder ids and occurrences are packed into callback data (64 bytes max): t:d:<uuid>:<ms base36>. */
export const packOcc = (d: Date) => d.getTime().toString(36)
export const unpackOcc = (s: string) => new Date(parseInt(s, 36))

/** The /today checklist: status, routines to tap off, goals with +buttons, and payments due. */
export async function todayView(user: User, now = new Date()): Promise<{ text: string; buttons: Button[][] }> {
  const day = localDate(now, user.timezone)
  const [agenda, payments, xp, streak, system] = await Promise.all([dayAgenda(user, day, now), upcomingPayments(user, now), totalXp(user), currentStreak(user, now), systemBoard(user, now)])
  const lv = levelFor(xp)
  const lines: string[] = [
    head('📋', formatDay(day, { weekday: 'long', day: 'numeric', month: 'long' }), [`Level ${lv.level} · ${titleFor(lv.level)}`, streak > 1 ? `🔥 ${streak} days` : null].filter(Boolean).join(' · ')),
  ]
  const buttons: Button[][] = []

  // The System's quests first: they're checked off by your data, not by tapping.
  if (system.quests.length) {
    const label = { daily: '⚔️ Daily quests', penalty: 'Retired penalty history', emergency: 'Corrective quest', recovery: 'Chosen recovery step' } as const
    for (const k of ['recovery', 'emergency', 'daily', 'penalty'] as const) {
      const qs = system.quests.filter((q) => q.kind === k)
      if (!qs.length) continue
      lines.push('', `<b>${label[k]}</b>${k === 'daily' ? ` · ${qs.filter((q) => q.status === 'cleared').length}/${qs.length}` : ''}`, ...qs.map(questLine))
    }
  }

  if (system.recovery) lines.push('', '<b>Recovery choices</b>', 'New quests are paused today. Open Today to choose a smaller step, rest, or review your priorities.')

  const goals = agenda.filter((i) => (i.schedule.meta as ScheduleMeta).trackerSlug && i.schedule.target && !isPayment(i.schedule))
  const goalIds = new Set(goals.map((g) => g.schedule.id))
  const routines = agenda.filter((i) => !isPayment(i.schedule) && !goalIds.has(i.schedule.id))
  const done = routines.filter((i) => i.status === 'done').length

  if (routines.length) {
    lines.push('', `${bar(done / routines.length)} <b>${done} of ${routines.length}</b> done`)
    if (done === routines.length) lines.push('🎉 <b>All done for today.</b>')
    lines.push('', '<b>Routines</b>')
    for (const i of routines) {
      const t = formatTime(i.occurrence, user.timezone)
      const name = `${t} ${esc(i.schedule.name)}`
      lines.push(i.status === 'done' ? `✅ <s>${name}</s>` : i.status === 'skipped' ? `⏭ <s>${name}</s>` : i.status === 'missed' ? `⚠️ ${name} <i>· missed</i>` : `▫️ ${name}`)
    }
    const open = routines.filter((i) => i.status === 'pending' || i.status === 'missed').slice(0, 8)
    for (let k = 0; k < open.length; k += 2) {
      // Twice-a-day routines (Omega-3 morning and night) get their time so the buttons differ.
      const label = (i: (typeof open)[number]) => open.filter((o) => o.schedule.id === i.schedule.id).length > 1 ? `${i.schedule.name.slice(0, 18)} · ${formatTime(i.occurrence, user.timezone)}` : i.schedule.name.slice(0, 24)
      buttons.push(open.slice(k, k + 2).map((i) => ({ text: `✅ ${label(i)}`, data: `t:d:${i.schedule.id}:${packOcc(i.occurrence)}` })))
    }
  } else {
    lines.push('', '<i>Nothing scheduled today.</i>')
  }

  const seen = new Set<string>()
  const goalLines: string[] = []
  for (const g of goals) {
    const s = g.schedule
    if (seen.has(s.id)) continue
    seen.add(s.id)
    const v = await goalValue(user, (s.meta as ScheduleMeta).trackerSlug!, day)
    const unit = s.unit ? ` ${s.unit}` : ''
    goalLines.push(`${v >= s.target! ? '🎉' : '💧'} ${esc(s.name)}\n${bar(v / s.target!)} ${formatNumber(v)} / ${formatNumber(s.target!)}${esc(unit)}`)
    if (v < s.target!) buttons.push([{ text: `💧 ${s.name.slice(0, 18)} +${formatNumber(goalStep(s))}${unit}`, data: `t:p:${s.id}` }])
  }
  if (goalLines.length) lines.push('', '<b>Goals</b>', ...goalLines)

  const due = payments.filter((p) => p.daysLeft <= 7)
  if (due.length) {
    lines.push('', '<b>Due this week</b>')
    for (const p of due) {
      const when = p.daysLeft === 0 ? 'today' : p.daysLeft === 1 ? 'tomorrow' : `in ${p.daysLeft} days`
      lines.push(`💳 ${esc(p.schedule.name)}${p.amount ? ` · ${esc(formatMoney(p.amount, p.currency ?? user.baseCurrency))}` : ''} <i>· ${when}</i>`)
    }
  }
  buttons.push([{ text: '🔄 Refresh', data: 't:r' }])
  return { text: lines.join('\n'), buttons }
}

const OPEN_SYSTEM: Button[][] = [[{ text: '📜 Quest log', data: 'q:o' }, { text: '📋 Today', data: 't:o' }]]

/** Minutes until local midnight. */
const untilMidnight = (user: User, now: Date) => { const w = utcToWall(now, user.timezone); return 1440 - (w.getUTCHours() * 60 + w.getUTCMinutes()) }

/** /quests: the System's quest log with progress. */
export async function questsView(user: User, now = new Date()): Promise<{ text: string; buttons: Button[][] }> {
  const b = await systemBoard(user, now)
  return { text: questLog(b.quests, b.difficulty, untilMidnight(user, now)), buttons: [[{ text: '🔄 Refresh', data: 'q:r' }, { text: '📋 Today', data: 't:o' }]] }
}

const AREA_LABEL = { health: 'HEALTH', mind: 'MIND', skills: 'SKILLS', wealth: 'WEALTH', hobbies: 'HOBBIES', relationships: 'BONDS' } as const

/** /status: the player's status window, Solo Leveling style. */
export async function statusView(user: User, now = new Date()): Promise<{ text: string; buttons: Button[][] }> {
  const [s, streak, freezes, board] = await Promise.all([xpSummary(user, now), currentStreak(user, now), freezesHeld(user), systemBoard(user, now)])
  const dailies = board.quests.filter((q) => q.kind === 'daily')
  const rows = s.areas.map((a) => `${AREA_LABEL[a.area].padEnd(8)} Lv ${String(a.level).padStart(2)}  ${bar(a.progress, 6)}${a.medal ? `  ${a.medal.label}` : ''}`)
  const text = [
    `🪪 <b>[STATUS]</b>`,
    `<b>${esc(user.name)}</b> · Level ${s.level} · <i>${esc(s.title)}</i>`,
    `${bar(s.progress)} ${pct(s.progress)} to level ${s.level + 1}`,
    `<i>${formatNumber(s.total - s.floor)} / ${formatNumber(s.next - s.floor)} XP${s.today ? ` · +${formatNumber(s.today)} today` : ''}</i>`,
    '',
    `<pre>${rows.join('\n')}</pre>`,
    `🔥 ${streak > 1 ? `${streak}-day streak` : 'No streak yet'} · 🧊 ${freezes}/2 freezes`,
    dailies.length ? `⚔️ Daily quests ${dailies.filter((q) => q.status === 'cleared').length}/${dailies.length} cleared` : '',
    s.nextTitle ? `\n<i>Next title: ${esc(s.nextTitle.title)} at level ${s.nextTitle.level}.</i>` : '',
  ].filter(Boolean).join('\n')
  return { text, buttons: OPEN_SYSTEM }
}

export const HELP = [
  '👋 <b>ReLife</b>',
  '<i>Your life as a game: the System sets quests from your own data.</i>',
  '',
  '<b>The System</b>',
  '/quests · your quest log and progress',
  '/status · level, XP and area stats',
  '',
  '<b>Every day</b>',
  '/today · your checklist; tap to check things off',
  '/mood · how are you feeling?',
  '/sleep · /wake · log bedtime and wake-up',
  '',
  '<b>Log anything</b>',
  '<code>water 500</code> · <code>mood 4</code> · <code>spent 120 chai</code>',
  '',
  '<b>Ask</b>',
  '/ask how much did I spend on Zepto this month?',
  'Or just type a question.',
].join('\n')

export const HELP_BUTTONS: Button[][] = [[{ text: '📜 Quest log', data: 'q:o' }, { text: '🪪 Status', data: 's:o' }], [{ text: '📋 Today', data: 't:o' }, { text: '🙂 Log mood', data: 'm:o' }]]
