import { Output } from 'ai'
import { z } from 'zod'
import { CATEGORIES, type ProposedAction } from '@/db/schema'
import { addInsight } from '@/core/insights'
import { esc } from '@/core/notify'
import { notify } from '@/core/outbox'
import { head } from '@/bot/ui'
import { localDate } from '@/core/time'
import type { User } from '@/core/user'
import { aiEnabled, model } from '../models'
import { generate } from '../run'
import { COACH_SYSTEM, digestText } from '../context'

const action = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('schedule'),
    name: z.string(),
    kind: z.enum(['routine', 'medicine', 'subscription', 'bill', 'renewal']),
    category: z.enum(CATEGORIES),
    rrule: z.string().describe('RRULE line without DTSTART, e.g. FREQ=DAILY;BYHOUR=7;BYMINUTE=0'),
    target: z.number().optional(),
    unit: z.string().optional(),
  }),
  z.object({
    type: z.literal('tracker'),
    slug: z.string().describe('lowercase-with-dashes'),
    name: z.string(),
    category: z.enum(CATEGORIES),
    kind: z.enum(['bool', 'number', 'duration', 'money', 'scale']),
    unit: z.string().optional(),
    target: z.number().optional(),
    direction: z.enum(['up', 'down']).optional(),
  }),
])

const schema = z.object({
  title: z.string().describe('headline of the week, under 8 words'),
  wins: z.array(z.string()).max(3),
  problems: z.array(z.string()).max(3),
  plan: z.string().describe('the one change to make next week and why, 2-3 sentences'),
  actions: z.array(action).max(3).describe('schedules or trackers that implement the plan; the user approves them'),
})

/** Sunday evening: a short review with an approvable plan. */
export async function weeklyReview(user: User, now = new Date()) {
  if (!aiEnabled('plan')) return null
  const res = await generate('plan', 'job.weekly-review', {
    model: model('plan'),
    output: Output.object({ schema }),
    system: `${COACH_SYSTEM}\nWrite this week's review. Wins and problems must cite numbers from the digest. Propose one change for next week, and only actions that directly implement it.`,
    prompt: await digestText(user, now),
  })
  const r = res.output
  if (!r) return null
  const body = [
    r.wins.length ? `**Wins**\n${r.wins.map((w) => `- ${w}`).join('\n')}` : '',
    r.problems.length ? `**Watch**\n${r.problems.map((p) => `- ${p}`).join('\n')}` : '',
    `**Next week**\n${r.plan}`,
  ].filter(Boolean).join('\n\n')
  const row = await addInsight(user, {
    kind: 'review', title: r.title, body,
    payload: { actions: r.actions as ProposedAction[], dedupeKey: `review:${localDate(now, user.timezone)}` },
  })
  if (!row) return null
  await notify(user, 'analysis', {
    text: reviewText(r), ref: `insight:${row.id}`,
    buttons: r.actions.length ? [[{ text: r.actions.length === 1 ? '✅ Add it' : `✅ Add all ${r.actions.length}`, data: `i:a:${row.id}` }, { text: 'Not now', data: `i:d:${row.id}` }]] : undefined,
  })
  return row
}

/** The Sunday message: wins, things to watch, next week's change in a quote, and what approving adds. */
export function reviewText(r: { title: string; wins: string[]; problems: string[]; plan: string; actions: { name: string }[] }) {
  return [
    head('🗓', r.title, 'Your week in review'),
    r.wins.length ? `\n<b>Wins</b>\n${r.wins.map((w) => `✅ ${esc(w)}`).join('\n')}` : '',
    r.problems.length ? `\n<b>Watch</b>\n${r.problems.map((p) => `🔍 ${esc(p)}`).join('\n')}` : '',
    `\n<b>Next week</b>\n<blockquote>${esc(r.plan)}</blockquote>`,
    r.actions.length ? `<b>Approve to add</b>\n${r.actions.map((a) => `➕ ${esc(a.name)}`).join('\n')}` : '',
  ].filter(Boolean).join('\n')
}
