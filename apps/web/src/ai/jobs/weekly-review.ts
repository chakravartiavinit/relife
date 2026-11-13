import { Output } from 'ai'
import { z } from 'zod'
import { CATEGORIES, type ProposedAction, type ReviewContent, type ReviewPoint } from '@/db/schema'
import { addInsight } from '@/core/insights'
import { esc } from '@/core/notify'
import { notify } from '@/core/outbox'
import { fold, head } from '@/bot/ui'
import { localDate } from '@/core/time'
import type { User } from '@/core/user'
import { inputOf, prepareGoalReviews, reviewPoint, type Goal, type GoalReview } from '@/core/goals'
import { db, schema } from '@/db'
import { and, eq, isNull } from 'drizzle-orm'
import { CADENCES, goalFields, goalIsSensitive, proposalText, validateGoal, applyProposal, type GoalProposal, type GoalReviewPoint } from '@/domain/goals'
import { aiEnabled, model } from '../models'
import { generate } from '../run'
import { COACH_SYSTEM, digestText } from '../context'
import { mask } from '../mask'
import { isSafeAiScheduleProposal } from '../tool-policy'

const action = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('schedule'),
    name: z.string().max(120),
    kind: z.string().max(40).describe('routine, subscription, bill, or renewal; unsupported kinds are discarded'),
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

const schema_ = z.object({
  title: z.string().describe('headline of the week, under 8 words'),
  wins: z.array(point).max(3),
  problems: z.array(point).max(3).describe('what slipped or needs watching'),
  focus: z.string().describe("next week's one change, under 10 words, imperative"),
  plan: z.string().describe('why that change and how, 1-2 short sentences'),
  actions: z.array(action).max(3).describe('schedules or trackers that implement the plan; the user approves them'),
})

type DueGoal = { review: GoalReview; goal: Goal }

/** A coach note and an optional proposal per due goal. Built only when goals are due: z.enum needs their IDs. */
function goalNotesSchema(due: DueGoal[]) {
  const ids = due.map((d) => d.goal.id) as [string, ...string[]]
  return z.array(z.object({
    goalId: z.enum(ids),
    note: z.string().max(240).describe('one sentence from the snapshot numbers; never say an action caused the outcome'),
    proposal: z.object({
      field: z.enum(['target', 'rangeLow', 'rangeHigh', 'targetDate', 'cadence']),
      value: z.union([z.number().finite(), z.string().max(20)]),
      why: z.string().max(200),
    }).optional().describe('optional; the user decides'),
  })).max(due.length)
}

/** Keep a proposal only when it is for a non-sensitive goal and the changed goal still validates. */
function safeProposal(d: DueGoal, p: GoalProposal | undefined, today: string): GoalProposal | null {
  if (!p || d.review.snapshot.sensitive || goalIsSensitive(d.goal.measureName, d.goal.unit, d.goal.title)) return null
  if (p.field === 'cadence' ? !(CADENCES as readonly string[]).includes(String(p.value)) : p.field === 'targetDate' ? typeof p.value !== 'string' : typeof p.value !== 'number') return null
  // Target fields must match the direction; date and cadence proposals fit every goal.
  if (p.field === 'target' && d.goal.direction === 'range') return null
  if ((p.field === 'rangeLow' || p.field === 'rangeHigh') && d.goal.direction !== 'range') return null
  const g = d.goal
  const errors = validateGoal(inputOf(g, applyProposal(goalFields(g), p)), {
    today, activating: false, activeCount: 0,
    // Proposals never touch actions; treat the current links as valid here.
    schedules: g.actions.filter((a) => a.kind === 'schedule').map((a) => ({ id: a.id, kind: 'routine', active: true })),
    trackers: [...g.actions.filter((a) => a.kind === 'tracker').map((a) => ({ id: a.id })), ...(g.trackerId ? [{ id: g.trackerId }] : [])],
  })
  return Object.keys(errors).length ? null : { field: p.field, value: p.value, why: p.why.trim().slice(0, 200) }
}

/** Save the coach note and proposal, only while the review is undecided and has none yet. */
/** Causal or blaming wording the coach note must never use; the template avoids it too. */
const UNSAFE_NOTE = /\b(because|caused?|causing|led to|leads to|thanks to|due to|as a result|behind|failed|off track)\b/i

/** No coach note for sensitive goals, and none that claims a cause. */
function safeNote(d: DueGoal, text: string) {
  if (d.review.snapshot.sensitive || goalIsSensitive(d.goal.measureName, d.goal.unit, d.goal.title)) return null
  const note = text.trim().slice(0, 240)
  return note && !UNSAFE_NOTE.test(note) ? note : null
}

async function saveCoachNotes(due: DueGoal[], notes: { goalId: string; note: string; proposal?: GoalProposal }[], today: string) {
  for (const n of notes) {
    const d = due.find((x) => x.goal.id === n.goalId)
    if (!d || d.review.aiNote || d.review.proposal) continue
    const proposal = safeProposal(d, n.proposal, today)
    const note = safeNote(d, n.note)
    await db.update(schema.goalReviews).set({ aiNote: note, proposal })
      .where(and(eq(schema.goalReviews.id, d.review.id), isNull(schema.goalReviews.decision), isNull(schema.goalReviews.proposal), isNull(schema.goalReviews.aiNote)))
    d.review = { ...d.review, aiNote: note, proposal }
  }
}

function goalPoints(due: DueGoal[]): GoalReviewPoint[] {
  return due.map((d) => ({
    ...reviewPoint(d.goal, d.review),
    note: d.review.aiNote ?? undefined,
    proposal: d.review.proposal ? proposalText(d.review.proposal, d.goal.unit) : undefined,
  }))
}

/**
 * Sunday evening: a short review with an approvable plan, plus a section per due outcome goal. Without a model,
 * goals still get the rule-based review; the message is sent only when a goal review is due.
 */
export async function weeklyReview(user: User, now = new Date()) {
  const today = localDate(now, user.timezone)
  const due: DueGoal[] = await prepareGoalReviews(user, now)
  const dedupeKey = `review:${today}`
  // The rule-based goal review: used without a model, and when the model call fails, so a due review is never lost.
  const template = async () => {
    if (!due.length) return null
    const goals = goalPoints(due)
    const review: ReviewContent = { wins: [], watch: [], focus: '', plan: '', goals }
    const title = 'Goal check-in'
    const row = await addInsight(user, {
      kind: 'review', title, body: goals.map((g) => [g.title, ...g.lines, g.prompt].join('\n')).join('\n\n'),
      payload: { review, dedupeKey },
    })
    if (!row) return null
    await notify(user, 'analysis', { text: reviewText({ title, ...review, actions: [] }), ref: `insight:${row.id}` })
    return row
  }
  if (!aiEnabled('plan')) return template()
  const digest = await digestText(user, now)
  // Sensitive goals are left out of the model's input: it may not comment on them or propose changes.
  const forModel = due.filter((d) => !d.review.snapshot.sensitive)
  const out = forModel.length ? schema_.extend({ goalNotes: goalNotesSchema(forModel) }) : schema_
  let res
  try {
    res = await generate('plan', 'job.weekly-review', {
      model: model('plan'),
      output: Output.object({ schema: out }),
      system: `${COACH_SYSTEM}\nWrite this week's review. Wins and problems must cite numbers from the digest. Propose one change for next week, and only actions that directly implement it. Never suggest medicine or dosage changes; direct medicine reminders to the existing medicine form.${forModel.length ? '\nFor each due outcome goal, use only the goal snapshot numbers. Never say an action caused an outcome. Proposals are optional and the user decides.' : ''}`,
      prompt: forModel.length ? `${digest}\n\nDue outcome goal reviews (snapshots computed by code):\n${mask(JSON.stringify(forModel.map((d) => ({ goalId: d.goal.id, title: d.goal.title, measure: d.goal.measureName, unit: d.goal.unit, direction: d.goal.direction, target: d.goal.target, range: [d.goal.rangeLow, d.goal.rangeHigh], targetDate: d.goal.targetDate, cadence: d.goal.cadence, sensitive: d.review.snapshot.sensitive, snapshot: d.review.snapshot }))))}` : digest,
    })
  } catch (e) {
    if (!due.length) throw e
    return template()
  }
  const r = res.output as (z.infer<typeof schema_> & { goalNotes?: { goalId: string; note: string; proposal?: GoalProposal }[] }) | undefined
  if (!r) return template()
  if (due.length && r.goalNotes) await saveCoachNotes(due, r.goalNotes, today)
  const actions = r.actions.filter((action) => action.type !== 'schedule' || isSafeAiScheduleProposal(action.kind, action.name, action.unit))
  const review: ReviewContent = { wins: r.wins, watch: r.problems, focus: r.focus, plan: r.plan, ...(due.length ? { goals: goalPoints(due) } : {}) }
  // Plain text too, for "Why?", search and anything that can't lay out the parts.
  const body = [
    r.wins.length ? `Wins:\n${r.wins.map((w) => `- ${w.headline}. ${w.detail}`).join('\n')}` : '',
    r.problems.length ? `Watch:\n${r.problems.map((p) => `- ${p.headline}. ${p.detail}`).join('\n')}` : '',
    `Next week: ${r.focus}. ${r.plan}`,
    ...(review.goals ?? []).map((g) => [g.title, ...g.lines, g.prompt].join('\n')),
  ].filter(Boolean).join('\n\n')
  const row = await addInsight(user, {
    kind: 'review', title: r.title, body,
    payload: { actions: actions as ProposedAction[], review, dedupeKey },
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
    r.focus ? `\n<b>🎯 Next week</b>\n<blockquote><b>${esc(r.focus)}</b>\n${esc(r.plan)}</blockquote>` : '',
    r.goals?.length ? `\n<b>🎯 Goals</b>\n${r.goals.map((g) => `• <b>${esc(g.title)}</b>: ${esc(g.lines.find((l) => !l.startsWith('Actions:') && !l.startsWith('Actions and')) ?? '')}\n<i>${esc(g.prompt)}</i>`).join('\n')}\nDecide in ReLife → Plan → Review.` : '',
    r.actions.length ? `➕ <b>Approve to add:</b> ${r.actions.map((a) => esc(a.name)).join(', ')}` : '',
    details ? `\n${fold(`📊 <b>The numbers</b>\n${details}`)}` : '',
  ].filter(Boolean).join('\n')
}
