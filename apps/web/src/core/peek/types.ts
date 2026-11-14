// What GET /api/peek returns, one shape per peek type. Plain JSON only (ISO strings, arrays, no Date or Map): the
// payload crosses fetch() and the views read it as typed. Pre-formatted strings ("when", "ago") are in the
// user's time zone, computed on the server so the client never guesses it.

import type { Category, ReviewContent } from '@/db/schema'
import type { MetricSummary } from '@/domain/metric-peek'
import type { RecoveryView } from '@/domain/recovery'
import type { SyncTone } from '@/domain/shell'
import type { DayStatus } from '@/domain/adherence'
import type { ConnectorItem } from '@/ui/components/connector-market'
import type { ScheduleInitial } from '@/ui/components/forms/schedule-form'
import type { GoalPickerData } from '@/ui/components/goals/goal-form'
import type { CheckInRow, HistoryRow } from '@/ui/components/goals/goal-history'
import type { GoalViewData } from '@/ui/components/goals/format'

export type MetricPeek = MetricSummary & {
  type: 'metric'
  id: string
  slug: string
  name: string
  category: Category
  kind: 'bool' | 'number' | 'duration' | 'money' | 'scale'
  unit: string | null
  target: number | null
  direction: 'up' | 'down'
  aggregate: 'sum' | 'last'
  today: string
  todayValue: number | null
  /** The last 12 entries, newest first. */
  entries: { id: string; date: string; value: number; source: string; verified: boolean; note: string | null }[]
  /** Where the recent numbers came from (distinct sources among the last 90 days of entries). */
  sources: { source: string; verified: boolean; lastDate: string }[]
}

export type RoutinePeek = {
  type: 'routine'
  id: string
  name: string
  kind: 'routine' | 'medicine' | 'subscription' | 'bill' | 'renewal'
  category: Category
  active: boolean
  /** "Daily · 09:00, 21:00" */
  when: string
  target: number | null
  unit: string | null
  /** The tracker a quantity routine logs into (water). */
  trackerSlug: string | null
  step: number | null
  dose: string | null
  stock: number | null
  refillSoon: boolean
  notes: string | null
  initial: ScheduleInitial | null
  days: { date: string; status: DayStatus }[]
  streak: number
  rate: number | null
  today: string
  /** Today's occurrences with their check state. `value` is a quantity routine's progress today. */
  occurrences: { iso: string; time: string; status: 'done' | 'skipped' | 'pending' | 'missed' }[]
  value: number | null
}

export type GoalPeek = {
  type: 'goal'
  id: string
  today: string
  goal: GoalViewData
  history: HistoryRow[]
  checkIns: CheckInRow[]
  picker: GoalPickerData
  activeCount: number
  reviewDue: boolean
}

export type TxnPeek = {
  type: 'txn'
  id: string
  merchant: string | null
  upiId: string | null
  /** In the payment's own currency. */
  amount: number
  currency: string
  /** In the user's base currency. */
  base: number
  baseCurrency: string
  when: string
  category: string | null
  categories: string[]
  source: string
  account: string | null
  /** The saved rule that sorts this merchant, if one was learned. */
  rule: { pattern: string; category: string } | null
  platform: string | null
  items: { name: string; qty: number; price: number | null }[]
}

export type MerchantPeek = {
  type: 'merchant'
  name: string
  baseCurrency: string
  month: string
  thisMonth: { total: number; count: number }
  last30: { total: number; count: number }
  last12: { total: number; count: number }
  /** Six months, oldest first. */
  months: { month: string; label: string; value: number }[]
  /** Average of the months before this one that had a payment. */
  usual: number | null
  /** This month against the usual, e.g. 3.2. */
  ratio: number | null
  category: string | null
  categories: string[]
  /** A payment to change the category through (the latest). */
  categoryTxnId: string | null
  rule: { pattern: string; category: string } | null
  latest: { id: string; when: string; amount: number; currency: string }[]
}

export type InsightPeek = {
  type: 'insight'
  id: string
  kind: 'nudge' | 'review' | 'plan' | 'alert'
  status: 'pending' | 'accepted' | 'dismissed' | 'done'
  title: string
  body: string
  meta: string | null
  when: string
  review: ReviewContent | null
  actions: { name: string; category: Category; summary: string }[]
  hasActions: boolean
  recovery: RecoveryView | null
  goalDraft: boolean
}

export type ConnectorPeek = {
  type: 'connector'
  item: ConnectorItem
  /** `demo`: the read-only demo has no worker, which is not a fault. */
  worker: { alive: boolean; ago: string; demo?: boolean }
}

export type PersonPeek = {
  type: 'person'
  id: string
  name: string
  relation: string | null
  contactEveryDays: number | null
  notes: string | null
  lastContacted: string | null
  /** Whole days since the last catch-up; null when never. */
  since: number | null
  overdue: boolean
  /** Days until it is due (negative when late); null without a rhythm. */
  dueIn: number | null
  /** Catch-ups with anyone, last 30 days, oldest first. */
  catchUps: { date: string; value: number | null }[]
}

export type QuestPeek = {
  type: 'quest'
  id: string
  source: 'system' | 'weekly'
  title: string
  reason: string | null
  area: string
  status: 'active' | 'cleared' | 'failed' | 'expired' | string
  /** "Today" or "This week" or a date range. */
  period: string
  progress: number | null
  target: number
  unit: string | null
  rank: string | null
  xp: number | null
  baseline: number | null
  /** The System's difficulty setting, 0 to 1. */
  difficulty: number | null
  /** What the quest counts, e.g. "Sleep, average" (system) or the measure name (weekly). */
  measure: string
  /** The tracker behind it, so the metric Peek can open. */
  statSlug: string | null
}

export type SyncPeek = {
  type: 'sync'
  tone: SyncTone
  label: string
  worker: { alive: boolean; heartbeat: string | null; ago: string; demo?: boolean }
  /** Failing first, then by name. */
  connections: { id: string; name: string; category: Category | null; status: 'ok' | 'error' | 'waiting'; ago: string; error: string | null; failures: number }[]
}

export type BriefPeek = {
  type: 'brief'
  scope: string
  /** Null until briefs exist (the area-briefs job arrives with the area template). */
  line: string | null
  facts: { label: string; value: string; peek?: string }[]
  source: 'rules' | 'ai' | null
  model: string | null
}

export type PeekData = MetricPeek | RoutinePeek | GoalPeek | TxnPeek | MerchantPeek | InsightPeek | ConnectorPeek | PersonPeek | QuestPeek | SyncPeek | BriefPeek
