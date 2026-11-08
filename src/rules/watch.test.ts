import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fresh, type Sent } from './watch'
import type { Row } from '@/domain/watch'

const row = (topic: string, group: string): Row => ({ topic, group, area: 'wealth', what: topic, better: 'down', today: 1, yesterday: 1, usual: 1, last7: 1, dayPct: 0.5, weekPct: 0.5 })

test('watch: once per topic and per group a day, weekly trends once a week, a daily budget', () => {
  const rows = [row('spend', 'spend'), row('spend:apps', 'spend'), row('habit:cat:Eating out', 'habit'), row('tracker:github.commits', 'tracker:github.commits')]
  const sent: Sent = { topicsToday: new Set(['spend']), groupsToday: new Set(['spend']), weekly: new Set(['habit:cat:Eating out']), countToday: 1 }
  const f = fresh(rows, sent)
  assert.deepEqual(f.rows.map((r) => r.topic), ['tracker:github.commits']) // delivery apps is the same event as spending
  assert.equal(f.budget, 1)
  assert.equal(fresh(rows, { ...sent, countToday: 5 }).budget, 0)
})
