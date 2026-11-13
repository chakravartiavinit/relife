import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NUDGE_TTL_DAYS, clearedLine, countNeedsYou, filterNeedsYou, groupUncategorised, nudgeExpired, rankNeedsYou, type InsightLite, type NeedsYouItem } from './needs-you'

const now = new Date('2026-11-12T12:00:00Z')
const iso = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3_600_000).toISOString()
const insight = (kind: InsightLite['kind'], id: string, hoursAgo = 1): InsightLite => ({ id, kind, title: id, body: '', at: iso(hoursAgo) })
const item = (kind: 'alert' | 'nudge' | 'plan', id: string, hoursAgo = 1): NeedsYouItem => ({ kind, id, insight: insight(kind, id, hoursAgo), at: iso(hoursAgo) })
const cat = (id: string, total: number, hoursAgo = 1): NeedsYouItem => ({ kind: 'categorise', id, merchant: id, sampleTxnId: id, count: 1, total, currency: 'INR', at: iso(hoursAgo) })
const unread = (id: string, hoursAgo = 1): NeedsYouItem => ({ kind: 'unread', id, rawEventIds: [id], summary: { app: 'sms', title: 'Bank SMS' }, reason: '', original: '', at: iso(hoursAgo) })

test('the queue runs recovery, alerts, review, drafts, proposals, nudges, then data', () => {
  const items: NeedsYouItem[] = [
    cat('c', 10), unread('u'), item('nudge', 'n'), item('plan', 'p'),
    { kind: 'goal-draft', id: 'g', insight: insight('plan', 'g'), draft: {} as never, at: iso(1) },
    { kind: 'review', id: 'r', insight: insight('review', 'r'), at: iso(1) },
    item('alert', 'a'),
    { kind: 'recovery', id: 'rec', insight: insight('nudge', 'rec'), recovery: null, at: iso(1) },
  ]
  assert.deepEqual(rankNeedsYou(items, now).map((i) => i.id), ['rec', 'a', 'r', 'g', 'p', 'n', 'u', 'c'])
})

test('newest first inside a group; merchants by spend', () => {
  const ranked = rankNeedsYou([item('alert', 'old', 30), item('alert', 'new', 2), cat('small', 50), cat('big', 900, 20), cat('mid', 400, 1)], now)
  assert.deepEqual(ranked.map((i) => i.id), ['new', 'old', 'big', 'mid', 'small'])
})

test('a nudge leaves the queue after its three days; other kinds stay', () => {
  assert.equal(NUDGE_TTL_DAYS, 3)
  assert.equal(nudgeExpired(iso(71), now), false)
  assert.equal(nudgeExpired(iso(72), now), true)
  const ranked = rankNeedsYou([item('nudge', 'fresh', 71), item('nudge', 'stale', 80), item('alert', 'old-alert', 24 * 20)], now)
  assert.deepEqual(ranked.map((i) => i.id), ['old-alert', 'fresh'])
})

test('the filters split decisions from data and the counts add up', () => {
  const items = [item('alert', 'a'), item('plan', 'p'), unread('u'), cat('c', 5), cat('d', 6)]
  assert.deepEqual(filterNeedsYou(items, 'decisions').map((i) => i.id), ['a', 'p'])
  assert.deepEqual(filterNeedsYou(items, 'data').map((i) => i.id), ['u', 'c', 'd'])
  assert.equal(filterNeedsYou(items, null).length, 5)
  assert.deepEqual(countNeedsYou(items), { total: 5, decisions: 2, data: 3 })
})

const t = (id: string, merchant: string | null, upiId: string | null, amount: number, at: string, currency = 'INR') => ({ id, merchant, upiId, amount, currency, at })

test('uncategorised payments group once per merchant, by UPI id when there is one', () => {
  const g = groupUncategorised([
    t('1', 'Blinkit', 'blinkit@upi', -449, '2026-11-10T10:00:00Z'),
    t('2', 'Blinkit Grocery', 'blinkit@upi', -120, '2026-11-11T10:00:00Z'),
    t('3', 'Chai Point', null, -60, '2026-11-09T10:00:00Z'),
    t('4', 'Chai Point', null, -80, '2026-11-08T10:00:00Z'),
    t('5', null, null, -10, '2026-11-07T10:00:00Z'),
    t('6', null, null, -20, '2026-11-07T11:00:00Z'),
  ])
  assert.equal(g.length, 4)
  const blinkit = g.find((x) => x.id === 'categorise:blinkit@upi')!
  assert.deepEqual([blinkit.count, blinkit.total, blinkit.sampleTxnId, blinkit.merchant], [2, 569, '2', 'Blinkit Grocery'])
  assert.equal(g.find((x) => x.id === 'categorise:Chai Point')!.total, 140)
  // Payments with neither a name nor a UPI id are each their own item, as in the badge's count.
  assert.equal(g.filter((x) => x.merchant === 'Unknown').length, 2)
})

test('a merchant paid in two currencies totals the latest currency only', () => {
  const [g] = groupUncategorised([t('1', 'Notion', null, -10, '2026-11-01T00:00:00Z', 'USD'), t('2', 'Notion', null, -800, '2026-11-05T00:00:00Z', 'INR'), t('3', 'Notion', null, -500, '2026-11-06T00:00:00Z', 'INR')])
  assert.deepEqual([g.count, g.total, g.currency], [3, 1300, 'INR'])
})

test('cleared lines name what happened', () => {
  assert.equal(clearedLine({ kind: 'plan', title: 'x', status: 'accepted', actions: [{ type: 'schedule', name: 'Wind down', kind: 'routine', category: 'health', rrule: '' }] }), 'Wind down added to your routines')
  assert.equal(clearedLine({ kind: 'alert', title: 'Low balance', status: 'dismissed' }), 'Dismissed: Low balance')
  assert.equal(clearedLine({ kind: 'nudge', title: 'x', status: 'done', recoveryChoice: 'rest' }), 'Rest today chosen')
  assert.equal(clearedLine({ kind: 'alert', title: 'Heads up', status: 'accepted' }), 'Heads up')
})
