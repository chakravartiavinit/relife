// What needs the user's attention, as one typed queue shared by the Coach list, Today's chip and the shell badge so
// the three always agree. Pure: the queries are in src/core/needs-you.ts (the badge's SQL is in src/core/shell.ts).
import type { ProposedAction, ReviewContent } from '@/db/schema'
import type { GoalDraft } from './goals'
import type { InboxSummary } from './inbox'
import type { RecoveryView } from './recovery'

/** A nudge leaves the queue (and the badge) this many days after it was written; it stays in History. */
export const NUDGE_TTL_DAYS = 3

/** How long after dismissing a card Undo still brings it back. */
export const RESTORE_MINUTES = 10

/** The three things that count: AI decisions waiting, data the app could not read, merchants with no category. */
export type NeedsYou = { total: number; decisions: number; data: number }

/** `data` = messages nobody can retry for you + payments waiting for a category (one per merchant). */
export function needsYou(decisions: number, unread: number, merchants: number): NeedsYou {
  const data = unread + merchants
  return { total: decisions + data, decisions, data }
}

/** The part of a pending insight the queue shows. Dates are ISO strings so the item is plain JSON for the client. */
export type InsightLite = {
  id: string; kind: 'alert' | 'nudge' | 'review' | 'plan'; title: string; body: string; at: string
  /** "Health · Today": the area and moment a rule put on the alert. */
  meta?: string; actions?: ProposedAction[]; review?: ReviewContent
  /** The day a weekly review was made for (its dedupe key), so a card can name the week it covers. */
  reviewOn?: string
}

export type NeedsYouItem =
  | { kind: 'alert' | 'nudge' | 'plan'; id: string; insight: InsightLite; at: string }
  | { kind: 'review'; id: string; insight: InsightLite; at: string }
  /** `recovery` is null once the day it was for has gone by: the choice closed at midnight. */
  | { kind: 'recovery'; id: string; insight: InsightLite; recovery: RecoveryView | null; at: string }
  | { kind: 'goal-draft'; id: string; insight: InsightLite; draft: GoalDraft; at: string }
  | { kind: 'unread'; id: string; rawEventIds: string[]; summary: InboxSummary; reason: string; original: string; at: string }
  | { kind: 'categorise'; id: string; merchant: string; sampleTxnId: string; count: number; total: number; currency: string; at: string }

export type NeedsYouKind = NeedsYouItem['kind']
export type NeedsYouFilter = 'decisions' | 'data'

/** Items made of data the app could not sort; everything else is a decision. */
export const DATA_KINDS: readonly NeedsYouKind[] = ['unread', 'categorise']
export const isDataItem = (i: NeedsYouItem) => DATA_KINDS.includes(i.kind)

/** Which queue an item belongs to. */
export const filterNeedsYou = (items: NeedsYouItem[], filter: NeedsYouFilter | null) =>
  filter === 'data' ? items.filter(isDataItem) : filter === 'decisions' ? items.filter((i) => !isDataItem(i)) : items

/** The counts the filter chips show. */
export function countNeedsYou(items: NeedsYouItem[]): NeedsYou {
  const data = items.filter(isDataItem).length
  return { total: items.length, decisions: items.length - data, data }
}

const ORDER: NeedsYouKind[] = ['recovery', 'alert', 'review', 'goal-draft', 'plan', 'nudge', 'unread', 'categorise']

/** Is this nudge past its three days? (The SQL behind the badge applies the same rule to `created_at`.) */
export const nudgeExpired = (at: string, now: Date) => now.getTime() - new Date(at).getTime() >= NUDGE_TTL_DAYS * 86_400_000

/**
 * The queue's order: the recovery choice (it closes at midnight), alerts, the weekly review, goal drafts, proposals,
 * nudges, then data: messages that could not be read and merchants to sort, the biggest spend first. Newest first
 * inside a group. Nudges past their three days are dropped.
 */
export function rankNeedsYou(items: NeedsYouItem[], now: Date): NeedsYouItem[] {
  const live = items.filter((i) => i.kind !== 'nudge' || !nudgeExpired(i.at, now))
  return live.sort((a, b) => {
    const k = ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind)
    if (k) return k
    if (a.kind === 'categorise' && b.kind === 'categorise' && a.total !== b.total) return b.total - a.total
    return b.at.localeCompare(a.at) || a.id.localeCompare(b.id)
  })
}

export type TxnLite = { id: string; merchant: string | null; upiId: string | null; amount: number; currency: string; at: Date | string }

/**
 * Uncategorised payments, one item per merchant (its UPI id when the payment has no name), so one category choice
 * fixes all of that merchant's rows. Same key as the badge's `coalesce(upi_id, merchant, id)`. The sample payment is
 * the latest one; the total counts the payments in its currency.
 */
export function groupUncategorised(txns: TxnLite[]): Extract<NeedsYouItem, { kind: 'categorise' }>[] {
  const groups = new Map<string, TxnLite[]>()
  for (const t of txns) {
    const key = t.upiId ?? t.merchant ?? t.id
    groups.set(key, [...(groups.get(key) ?? []), t])
  }
  return [...groups].map(([key, list]) => {
    const iso = (t: TxnLite) => new Date(t.at).toISOString()
    const latest = list.reduce((a, b) => (iso(b) > iso(a) ? b : a))
    const same = list.filter((t) => t.currency === latest.currency)
    return {
      kind: 'categorise' as const, id: `categorise:${key}`, merchant: latest.merchant ?? latest.upiId ?? 'Unknown', sampleTxnId: latest.id,
      count: list.length, total: Math.round(same.reduce((s, t) => s + Math.abs(t.amount), 0) * 100) / 100, currency: latest.currency, at: iso(latest),
    }
  })
}

/** One line for "Cleared today": what was done to a card, in the words the user would use. */
export function clearedLine(i: { kind: string; title: string; status: string; actions?: ProposedAction[]; recoveryChoice?: string | null; goalDraft?: boolean }): string {
  if (i.recoveryChoice) return i.recoveryChoice === 'smaller' ? 'Smaller step added to Today' : i.recoveryChoice === 'rest' ? 'Rest today chosen' : 'Priorities review chosen'
  if (i.status === 'dismissed') return `Dismissed: ${i.title}`
  const first = i.actions?.[0]
  if (i.status === 'accepted' && first) return `${first.name} added to your routines`
  return i.title
}
