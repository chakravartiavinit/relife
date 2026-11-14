import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  SHARE_FIELDS, SHARE_KINDS, cardModel, defaultShow, isoWeek, parseShow, spendDirection, streakMilestone, stripEmoji, weekRange, type ShareData,
} from './share-card'

const weekly: ShareData = {
  kind: 'weekly', name: 'Alex', weekStart: '2026-11-09', daysShown: 5, xp: 1284, questsCleared: 2, topArea: 'Health',
  routines: { done: 41, total: 49 }, goals: { onPace: 2, total: 3 }, stepsAvg: 9772, sleepAvgHours: 7.4, spend: 'less',
}

test('defaults hide the name, health numbers, money and everything beyond the headline', () => {
  for (const kind of SHARE_KINDS) assert.ok(!defaultShow(kind).includes('name'), `${kind} shows the name by default`)
  assert.deepEqual(defaultShow('weekly'), ['days', 'xp', 'quests'])
  assert.deepEqual(defaultShow('level'), ['level', 'title'])
  assert.deepEqual(defaultShow('streak'), ['streak'])
  assert.deepEqual(defaultShow('achievement'), ['title', 'tier'])
  const m = cardModel(weekly, defaultShow('weekly'))
  assert.deepEqual(m.stats.map((s) => s.id), ['quests'])
  assert.equal(m.name, null)
})

test('no field is money, a note, a goal reason, a merchant, a person or a connector', () => {
  const banned = /money|amount|note|reason|merchant|person|people|connector|source|price/i
  for (const kind of SHARE_KINDS) for (const f of SHARE_FIELDS[kind]) assert.ok(!banned.test(f.id), `${kind}.${f.id}`)
})

test('parseShow: absent is the defaults, empty is nothing, an unknown id is refused', () => {
  assert.deepEqual(parseShow('weekly', null), defaultShow('weekly'))
  assert.deepEqual(parseShow('weekly', ''), [])
  assert.deepEqual(parseShow('weekly', 'xp,steps,xp'), ['xp', 'steps'])
  assert.equal(parseShow('weekly', 'xp,money'), undefined)
  assert.equal(parseShow('level', 'steps'), undefined)
})

test('stripEmoji removes pictographs and joiners, keeps text', () => {
  assert.equal(stripEmoji('Early bird 🌅'), 'Early bird')
  assert.equal(stripEmoji('7-day 🔥 streak ❤️‍🔥'), '7-day streak')
  assert.equal(stripEmoji('Ärger über Zoë'), 'Ärger über Zoë')
  assert.equal(stripEmoji('3️⃣ things'), '3 things')
})

test('streakMilestone is true for the listed days only', () => {
  for (const n of [3, 7, 14, 30, 50, 100, 200, 365]) assert.ok(streakMilestone(n), String(n))
  for (const n of [0, 1, 2, 4, 8, 29, 31, 99, 364, 366]) assert.ok(!streakMilestone(n), String(n))
})

test('week helpers', () => {
  assert.equal(isoWeek('2026-11-09'), 46)
  assert.equal(isoWeek('2026-01-01'), 1)
  assert.equal(isoWeek('2021-01-03'), 53)
  assert.equal(weekRange('2026-11-09'), '9–15 Nov')
  assert.equal(weekRange('2026-09-28'), '28 Sep – 4 Oct')
})

test('cardModel: weekly shows only ticked fields and skips unknown values', () => {
  const m = cardModel(weekly, ['xp', 'days', 'steps', 'sleep', 'spend', 'goals', 'routines', 'area', 'name'])
  assert.deepEqual(m.hero, { value: '+1,284', unit: 'XP' })
  assert.deepEqual(m.days, { shown: 5, of: 7 })
  assert.deepEqual(m.stats.map((s) => [s.id, s.value]), [
    ['area', 'Health'], ['routines', '41/49'], ['goals', '2 of 3'], ['steps', '9,772'], ['sleep', '7h 24m'], ['spend', 'Less'],
  ])
  assert.equal(m.name, 'Alex')
  assert.equal(m.range, 'Week 46 · 9–15 Nov')
  const none = cardModel({ ...weekly, stepsAvg: null, sleepAvgHours: null, spend: null, goals: { onPace: 0, total: 0 } }, ['steps', 'sleep', 'spend', 'goals'])
  assert.deepEqual(none.stats, [])
  assert.deepEqual(cardModel(weekly, []).stats, [])
})

test('cardModel: level, streak and achievement', () => {
  const level = cardModel({ kind: 'level', name: 'Alex', level: 22, title: 'Vanguard', totalXp: 20418, areas: [{ label: 'Health', level: 9 }, { label: 'Mind', level: 4 }] }, ['level', 'title', 'xp', 'areas'])
  assert.deepEqual(level.hero, { value: '22', unit: 'Level' })
  assert.equal(level.caption, 'Vanguard')
  assert.deepEqual(level.stats.map((s) => s.value), ['20,418', 'Level 9', 'Level 4'])
  const bare = cardModel({ kind: 'level', name: 'Alex', level: 22, title: 'Vanguard', totalXp: 20418, areas: [] }, defaultShow('level'))
  assert.deepEqual(bare.stats, [])

  const streak = cardModel({ kind: 'streak', name: 'Alex', days: 30, best: 41, freezesUsed: 1 }, ['streak', 'best', 'freezes'])
  assert.deepEqual(streak.hero, { value: '30' })
  assert.equal(streak.caption, 'days in a row')
  assert.deepEqual(streak.stats.map((s) => s.value), ['41 days', '1'])
  assert.equal(cardModel({ kind: 'streak', name: 'A', days: 1, best: 1, freezesUsed: 0 }, ['streak']).caption, 'day in a row')

  const medal = cardModel({ kind: 'achievement', name: 'Alex', title: 'Early bird 🌅', tier: 'gold', date: '2026-11-02' }, ['title', 'tier', 'date'])
  assert.equal(medal.hero?.value, 'Early bird')
  assert.equal(medal.caption, 'Gold medal · 2 Nov 2026')
  assert.equal(medal.tier, 'gold')
  assert.equal(cardModel({ kind: 'achievement', name: 'Alex', title: 'X', tier: 'gold', date: '2026-11-02' }, ['title']).caption, null)
})

test('cardModel never carries emoji, even from the name', () => {
  const m = cardModel({ kind: 'streak', name: 'Sam 🚀', days: 7, best: 7, freezesUsed: 0 }, ['streak', 'name'])
  assert.equal(m.name, 'Sam')
})

test('spendDirection compares with the usual week and never returns an amount', () => {
  assert.equal(spendDirection(50, 400), 'less')
  assert.equal(spendDirection(150, 400), 'more')
  assert.equal(spendDirection(105, 400), 'same')
  assert.equal(spendDirection(100, 0), null)
})
