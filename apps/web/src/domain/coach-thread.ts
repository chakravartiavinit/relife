// The Ask conversation as data: what goes back to the model for a follow-up, what an answer was built from, how long
// messages are kept. Pure: the table is in src/db/schema.ts, the reads and writes in src/core/coach-messages.ts.

import { peekParam } from './peek'

/** What a Coach answer was built from: a label for the chip and, when the number has one, the Peek that opens it. */
export type CoachSource = { label: string; peek?: string }

export type CoachMessagePayload = {
  sources?: CoachSource[]
  /** Routines the coach proposed while answering (pending `plan` insights), shown inline with Approve and Dismiss. */
  insightIds?: string[]
  /** The answer is the error text of a failed call, not something the model said. */
  error?: boolean
}

export type ThreadMessage = { role: 'user' | 'assistant'; text: string; payload: CoachMessagePayload }

/** One conversation for the app and Telegram, kept this long; the daily `coach-messages-prune` job deletes older rows. */
export const COACH_RETENTION_DAYS = 180
/** Messages the model sees before a new question, and the most characters they may add up to. */
export const HISTORY_MESSAGES = 6
export const HISTORY_CHARS = 2000
/** Messages the Ask pane loads. */
export const THREAD_LOAD = 30

/**
 * The last few turns for `generate('chat', …)`, so "and last month?" works. Failed answers are left out together with
 * the question they belonged to, a thread must start with a user message, and the whole is cut to HISTORY_CHARS by
 * dropping the oldest messages first (a message that alone is longer is trimmed).
 */
export function historyForModel(messages: ThreadMessage[], limit = HISTORY_MESSAGES, chars = HISTORY_CHARS): { role: 'user' | 'assistant'; content: string }[] {
  const ok = messages.filter((m, i) => !m.payload.error && !(m.role === 'user' && messages[i + 1]?.payload.error))
  let kept = ok.slice(-limit)
  const size = (xs: ThreadMessage[]) => xs.reduce((s, m) => s + m.text.length, 0)
  while (kept.length > 1 && size(kept) > chars) kept = kept.slice(1)
  while (kept.length && kept[0].role !== 'user') kept = kept.slice(1)
  return kept.map((m) => ({ role: m.role, content: m.text.slice(0, chars) }))
}

/** The part of an AI SDK step this file reads: what was called, with what, and what came back. */
export type ToolStep = {
  toolCalls?: { toolName: string; input?: unknown }[]
  toolResults?: { toolName: string; input?: unknown; output?: unknown }[]
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dm = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`

/** "1–31 Oct", "28 Oct–3 Nov"; a window with an open end shows the one date it has. */
export function windowLabel(from?: string, to?: string): string {
  const ok = (d?: string): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d)
  if (ok(from) && ok(to)) return from.slice(0, 7) === to.slice(0, 7) ? `${Number(from.slice(8, 10))}–${dm(to)}` : `${dm(from)}–${dm(to)}`
  if (ok(from)) return `from ${dm(from)}`
  if (ok(to)) return `to ${dm(to)}`
  return ''
}

const join = (...parts: (string | undefined | false)[]) => parts.filter(Boolean).join(' · ')
const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

const LABEL: Record<string, string> = {
  list_schedules: 'Subscriptions and bills', quest_history: 'Quests', learning_progress: 'Learning', goals: 'Goals',
  people: 'People', portfolio_summary: 'Portfolio', recent_trades: 'Trades',
}

/**
 * Chips for the data a tool call read. A tracker with a slug opens its metric Peek; a merchant filter that found a
 * merchant opens that merchant. Everything else is a label only. One chip per distinct label, in the order read.
 */
export function sourcesFromSteps(steps: ToolStep[], limit = 6): CoachSource[] {
  const out = new Map<string, CoachSource>()
  for (const step of steps) {
    const results = step.toolResults?.length ? step.toolResults : (step.toolCalls ?? []).map((c) => ({ ...c, output: undefined }))
    for (const r of results) {
      const input = asRecord(r.input)
      const range = windowLabel(text(input.from), text(input.to))
      let source: CoachSource | null = null
      if (r.toolName === 'get_metric') {
        const slug = text(input.slug)
        const row = Array.isArray(r.output) ? asRecord(r.output[0]) : {}
        source = slug ? { label: join(text(row.name) ?? slug, range), peek: peekParam({ type: 'metric', id: slug }) } : { label: join('Trackers', range) }
      } else if (r.toolName === 'spend_by') {
        const by = input.by === 'merchant' ? 'merchant' : 'category'
        const filter = text(input.filter)
        const groups = Array.isArray(asRecord(r.output).groups) ? (asRecord(r.output).groups as unknown[]) : []
        const found = by === 'merchant' && filter ? groups.map((g) => text(asRecord(g).merchant)).find((m) => m?.toLowerCase().includes(filter.toLowerCase())) : undefined
        source = { label: join(found ?? (filter ? `Spending on ${filter}` : `Spending by ${by}`), range), peek: found ? peekParam({ type: 'merchant', id: found }) : undefined }
      } else if (LABEL[r.toolName]) {
        source = { label: join(LABEL[r.toolName], r.toolName === 'quest_history' || r.toolName === 'recent_trades' ? range : undefined) }
      }
      if (source && !out.has(source.label)) out.set(source.label, source.peek ? source : { label: source.label })
    }
  }
  return [...out.values()].slice(0, limit)
}

/** Pending suggestions `propose_schedule` created during the answer. */
export function proposalIds(steps: ToolStep[]): string[] {
  const ids = new Set<string>()
  for (const step of steps) {
    for (const r of step.toolResults ?? []) {
      const o = asRecord(r.output)
      if (r.toolName === 'propose_schedule' && o.pending === true && typeof o.id === 'string') ids.add(o.id)
    }
  }
  return [...ids]
}
