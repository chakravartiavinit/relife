import { Output } from 'ai'
import { z } from 'zod'
import { CATEGORIES, type ProposedAction, type ReviewContent, type ReviewPoint } from '@/db/schema'
import { addInsight } from '@/core/insights'
import { esc } from '@/core/notify'
import { notify } from '@/core/outbox'
import { fold, head } from '@/bot/ui'
import { localDate } from '@/core/time'
import type { User } from '@/core/user'
import { aiEnabled, model } from '../models'
import { generate } from '../run'
import { COACH_SYSTEM, digestText } from '../context'
import { allowedScheduleKinds, isSafeAiScheduleProposal } from '../tool-policy'

const action = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('schedule'),
    name: z.string().max(120),
    kind: z.enum(allowedScheduleKinds()),
    category: z.enum(CATEGORIES),
    rrule: z.string().describe('RRULE line without DTSTART, e.g. FREQ=DAILY;BYHOUR=7;BYMINUTE=0'),
    target: z.number().finite().optional(),
    unit: z.string().max(40).optional(),
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

const point = z.object({
  area: z.enum(CATEGORIES),
  headline: z.string().describe('under 8 words, with the key number, e.g. "Lights out 7 of 7 nights"'),
  detail: z.string().describe('one short sentence with the numbers from the digest behind it'),
})

const schema = z.object({
  title: z.string().describe('headline of the week, under 8 words'),
  wins: z.array(point).max(3),
  problems: z.array(point).max(3).describe('what slipped or needs watching'),
  focus: z.string().describe("next week's one change, under 10 words, imperative"),
  plan: z.string().describe('why that change and how, 1-2 short sentences'),
  actions: z.array(action).max(3).describe('schedules or trackers that implement the plan; the user approves them'),
})

/** Sunday evening: a short review with an approvable plan. */
export async function weeklyReview(user: User, now = new Date()) {
  if (!aiEnabled('plan')) return null
  const res = await generate('plan', 'job.weekly-review', {
    model: model('plan'),
    output: Output.object({ schema }),
    system: `${COACH_SYSTEM}\nWrite this week's review. Wins and problems must cite numbers from the digest. Propose one change for next week, and only actions that directly implement it. Never suggest medicine or dosage changes; direct medicine reminders to the existing medicine form.`,
    prompt: await digestText(user, now),
  })
  const r = res.output
  if (!r) return null
  const actions = r.actions.filter((action) => action.type !== 'schedule' || isSafeAiScheduleProposal(action.kind, action.name, action.unit))
  const review: ReviewContent = { wins: r.wins, watch: r.problems, focus: r.focus, plan: r.plan }
  // Plain text too, for "Why?", search and anything that can't lay out the parts.
  const body = [
    r.wins.length ? `Wins:\n${r.wins.map((w) => `- ${w.headline}. ${w.detail}`).join('\n')}` : '',
    r.problems.length ? `Watch:\n${r.problems.map((p) => `- ${p.headline}. ${p.detail}`).join('\n')}` : '',
    `Next week: ${r.focus}. ${r.plan}`,
  ].filter(Boolean).join('\n\n')
  const row = await addInsight(user, {
    kind: 'review', title: r.title, body,
    payload: { actions: actions as ProposedAction[], review, dedupeKey: `review:${localDate(now, user.timezone)}` },
  })
  if (!row) return null
  await notify(user, 'analysis', {
    text: reviewText({ title: r.title, ...review, actions }), ref: `insight:${row.id}`,
    buttons: actions.length ? [[{ text: actions.length === 1 ? '✅ Add it' : `✅ Add all ${actions.length}`, data: `i:a:${row.id}` }, { text: 'Not now', data: `i:d:${row.id}` }]] : undefined,
  })
  return row
}

const AREA_EMOJI: Record<string, string> = { health: '❤️', mind: '🧠', skills: '💻', wealth: '💰', hobbies: '🎨', relationships: '🤝' }

/**
 * The Sunday message, readable at a glance: one line per win and per thing to watch, next week's change in a quote,
 * what approving adds, and the numbers behind each point folded until tapped.
 */
export function reviewText(r: ReviewContent & { title: string; actions: { name: string }[] }) {
  // The section says win or watch; the emoji says which part of life it's about.
  const line = (p: ReviewPoint) => `${AREA_EMOJI[p.area] ?? '•'} ${esc(p.headline)}`
  const details = [...r.wins, ...r.watch].map((p) => `• <b>${esc(p.headline)}</b>: ${esc(p.detail)}`).join('\n')
  return [
    head('🗓', r.title, 'Your week in review'),
    r.wins.length ? `\n<b>🏆 Wins</b>\n${r.wins.map(line).join('\n')}` : '',
    r.watch.length ? `\n<b>👀 Watch</b>\n${r.watch.map(line).join('\n')}` : '',
    `\n<b>🎯 Next week</b>\n<blockquote><b>${esc(r.focus)}</b>\n${esc(r.plan)}</blockquote>`,
    r.actions.length ? `➕ <b>Approve to add:</b> ${r.actions.map((a) => esc(a.name)).join(', ')}` : '',
    details ? `\n${fold(`📊 <b>The numbers</b>\n${details}`)}` : '',
  ].filter(Boolean).join('\n')
}
