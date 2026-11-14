import type { PeekData } from '@/core/peek/types'
import { summarizeMetric } from '@/domain/metric-peek'
import type { GoalSnapshot } from '@/domain/goals'

// Sample payloads for /dev/ui: one per Peek type, shaped exactly like GET /api/peek (plain JSON).

const TODAY = '2026-11-12'
const day = (back: number) => new Date(Date.UTC(2026, 10, 12 - back)).toISOString().slice(0, 10)
const sleep = new Map<string, number>()
for (let i = 0; i < 90; i++) if (i % 9 !== 4) sleep.set(day(i), 6 + ((i * 7) % 20) / 10)

const SNAPSHOT: GoalSnapshot = {
  window: { from: day(27), to: TODAY, days: 28 },
  outcome: { baseline: 6.1, current: 6.9, observations: 20, needed: 8, status: 'toward', progressShare: 0.4, latestCheckIn: null, days: [...sleep.entries()].slice(0, 28).reverse().map(([date, value]) => ({ date, value })) },
  actions: [], adherence: 0.71, met: false, sensitive: false, computedAt: '2026-11-12T08:00:00.000Z',
}

export const PEEK_FIXTURES: Record<PeekData['type'] | 'txnLinked', PeekData> = {
  metric: {
    type: 'metric', id: 'sleep.hours', slug: 'sleep.hours', name: 'Sleep', category: 'health', kind: 'duration', unit: 'h', target: 7.5, direction: 'up',
    aggregate: 'last', today: TODAY, todayValue: 6.8,
    ...summarizeMetric(sleep, TODAY, 7.5, 'up'),
    entries: [0, 1, 2, 3].map((i) => ({ id: `e${i}`, date: day(i), value: sleep.get(day(i)) ?? 7, source: i === 1 ? 'manual' : 'garmin', verified: i !== 1, note: null })),
    sources: [{ source: 'garmin', verified: true, lastDate: day(0) }, { source: 'manual', verified: false, lastDate: day(1) }],
  },
  routine: {
    type: 'routine', id: 'r1', name: 'Water', kind: 'routine', category: 'health', active: true, when: 'Daily · 09:00, 13:00, 18:00', target: 3000, unit: 'ml',
    trackerSlug: 'water', step: 250, dose: null, stock: null, refillSoon: false, notes: 'A glass at every meal.', initial: null,
    days: [6, 5, 4, 3, 2, 1, 0].map((i) => ({ date: day(i), status: i === 3 ? 'missed' : i === 0 ? 'pending' : 'done' })), streak: 2, rate: 0.86,
    today: TODAY, occurrences: [{ iso: '2026-11-12T03:30:00.000Z', time: '09:00', status: 'done' }, { iso: '2026-11-12T07:30:00.000Z', time: '13:00', status: 'pending' }], value: 1250,
  },
  goal: {
    type: 'goal', id: 'g1', today: TODAY, activeCount: 2, reviewDue: false,
    goal: {
      id: 'g1', title: 'Sleep 7 hours', reason: 'Mornings are slow when I sleep short.', area: 'health', status: 'active', measureKind: 'tracker', trackerId: 't1', measureName: 'Sleep', unit: 'h',
      direction: 'increase', target: 7, rangeLow: null, rangeHigh: null, baselineValue: 6.1, baselineDate: day(28), baselineHow: 'Average of 20 nights', baselineObservations: 20,
      targetDate: '2027-01-31', cadence: 'weekly', nextReviewOn: '2026-11-16', actions: [], version: 1, pausedAt: null, finishedAt: null, snapshot: SNAPSHOT, sensitive: false,
      actionNames: ['Lights out 23:00'], trackerArchived: false, startedOn: day(28), pausedOn: null, finishedOn: null,
    },
    history: [], checkIns: [], picker: { trackers: [], routines: [] },
  },
  txn: {
    type: 'txn', id: 't1', merchant: 'Big Basket', upiId: 'bigbasket@icici', amount: 1840, currency: 'INR', base: 1840, baseCurrency: 'INR', when: 'Today, 11:20', category: 'Groceries',
    categories: ['Groceries', 'Food', 'Transport', 'Other'], source: 'sms', account: 'HDFC ··4321', rule: { pattern: 'big basket', category: 'Groceries' }, platform: 'Big Basket',
    items: [{ name: 'Tomatoes 1 kg', qty: 1, price: 64 }, { name: 'Basmati rice 5 kg', qty: 1, price: 720 }, { name: 'Curd', qty: 4, price: null }],
    paidFrom: { id: 'bank-row-1', account: 'HDFC ··4321', when: 'Fri, 13 Nov' },
  },
  txnLinked: {
    type: 'txn', id: 't2', merchant: 'UPI-BIGBASKET GROCERY', upiId: null, amount: -1840, currency: 'INR', base: -1840, baseCurrency: 'INR', when: 'Fri, 13 Nov', category: 'Groceries',
    categories: ['Groceries', 'Food', 'Transport', 'Other'], source: 'statement', account: 'HDFC ··4321', rule: null, platform: null, items: [],
    sameAs: { id: 't1', label: 'Big Basket' },
  },
  merchant: {
    type: 'merchant', name: 'Big Basket', baseCurrency: 'INR', month: '2026-11', thisMonth: { total: 5600, count: 4 }, last30: { total: 6200, count: 5 }, last12: { total: 41200, count: 38 },
    months: [['2026-06', 'Jun', 1800], ['2026-07', 'Jul', 2100], ['2026-08', 'Aug', 1500], ['2026-09', 'Sep', 2400], ['2026-10', 'Oct', 1900], ['2026-11', 'Nov', 5600]].map(([month, label, value]) => ({ month: month as string, label: label as string, value: value as number })),
    usual: 1940, ratio: 2.9, category: 'Groceries', categories: ['Groceries', 'Food', 'Other'], categoryTxnId: 't1', rule: { pattern: 'big basket', category: 'Groceries' },
    latest: [{ id: 't1', when: 'Today', amount: 1840, currency: 'INR' }, { id: 't2', when: '8 Nov', amount: 1260, currency: 'INR' }],
  },
  insight: {
    type: 'insight', id: 'i1', kind: 'nudge', status: 'pending', title: 'Sleep has slipped this week', body: 'Four of the last seven nights were under 6.5 hours. A fixed lights-out time is the smallest change that helps.',
    meta: 'Rules · health', when: 'Today, 07:10', review: null, actions: [{ name: 'Lights out 23:00', category: 'health', summary: 'Daily at 23:00' }], hasActions: true, recovery: null, goalDraft: false,
  },
  connector: {
    type: 'connector', worker: { alive: true, ago: '2 min ago' },
    item: { id: 'garmin', name: 'Garmin', section: 'keys', category: 'health', description: 'Sleep, steps and heart rate from your watch.', provides: ['Sleep', 'Steps', 'Heart rate'], missingEnv: [], status: 'ok', detail: 'Every hour · synced 3 min ago', connected: true, sync: true, fields: [], syncs: [{ at: '3 min ago', ok: true, events: 12 }, { at: '1 h ago', ok: true, events: 9 }] },
  },
  person: {
    type: 'person', id: 'p1', name: 'Asha', relation: 'Sister', contactEveryDays: 14, notes: 'Birthday on 3 Dec.', lastContacted: '2026-10-24', since: 19, overdue: true, dueIn: -5,
    catchUps: [{ date: day(19), value: 1 }, { date: day(8), value: 1 }],
  },
  quest: {
    type: 'quest', id: 'q1', source: 'system', title: 'Sleep: 7 h or more', reason: 'Your average slipped below 6.5 h.', area: 'health', status: 'active', period: 'Today', progress: 5.5, target: 7, unit: 'h',
    rank: 'D', xp: 40, baseline: 6.4, difficulty: 0.5, measure: 'Sleep, average', statSlug: 'sleep.hours',
  },
  sync: {
    type: 'sync', tone: 'warn', label: '1 needs a fix', worker: { alive: true, heartbeat: '2026-11-12T08:38:00.000Z', ago: '2 min ago' },
    connections: [
      { id: 'garmin', name: 'Garmin', category: 'health', status: 'error', ago: '3 h ago', error: 'Login expired. Sign in again.', failures: 3 },
      { id: 'gmail', name: 'Gmail receipts', category: 'wealth', status: 'ok', ago: '12 min ago', error: null, failures: 0 },
    ],
  },
  brief: { type: 'brief', scope: 'health', line: 'Sleep is 40 min under your usual, and 3 of 5 routines are done today.', facts: [{ label: 'Sleep, 7 days', value: '6h 10m vs usual 6h 50m', peek: 'metric:sleep.hours' }, { label: 'Routines, 7 days', value: '82%' }, { label: 'Steps today', value: '4,210' }], source: 'rules', model: null },
}
