import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  SHARE_FIELDS, SHARE_KINDS, cardModel, defaultShow, isoWeek, parseShow, spendDirection, streakMilestone, cardText, shareText, reviewDateOf, reviewedWeekStart, weekRange, type ShareData,
} from './share-card'

const weekly: ShareData = {
  kind: 'weekly', name: 'Alex', weekStart: '2026-11-09', daysShown: 5, xp: 1284, questsCleared: 2, topArea: 'Health',
  routines: { done: 41, total: 49 }, goals: { onPace: 2, total: 3 }, stepsAvg: 9772, sleepAvgHours: 7.4, spend: 'less',
}

test('defaults hide the name, health numbers, money and everything beyond the headline', () => {
  for (const kind of SHARE_KINDS) assert.ok(!defaultShow(kind).includes('name'), `${kind} shows the name by default`)
  assert.deepEqual(defaultShow('weekly'), ['days', 'xp', 'quests'])
  assert.deepEqual(defaultShow('level'), ['level', 'title', 'progress'])
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

test('cardText keeps what the card fonts have and drops the rest: emoji, flags, marks, other scripts', () => {
  assert.equal(cardText('Early bird 🌅'), 'Early bird')
  assert.equal(cardText('7-day 🔥 streak ❤️‍🔥'), '7-day streak')
  assert.equal(cardText('Ärger über Zoë'), 'Ärger über Zoë')
  assert.equal(cardText('3️⃣ things'), '3 things')
  assert.equal(cardText('Asha 🇮🇳 👍🏽 ★ ✓'), 'Asha')
  assert.equal(cardText('Rahul राहुल'), 'Rahul')
  assert.equal(cardText('राहुल 🇮🇳 ★'), '')
  assert.equal(cardText('Week 46 · 9–15 Nov'), 'Week 46 · 9–15 Nov')
})

test('the name is dropped when nothing of it can be drawn, and every card string is clean', () => {
  const lvl: ShareData = { kind: 'level', name: 'राहुल 🇮🇳 ★', level: 3, title: 'Rookie ★', totalXp: 1200, areas: [{ label: 'Health 🌿', level: 2 }] }
  const m = cardModel(lvl, ['name', 'level', 'title', 'xp', 'areas'])
  assert.equal(m.name, null)
  assert.equal(m.caption, 'Rookie')
  assert.deepEqual(m.stats.map((x) => x.label), ['Total XP', 'Health'])
  const named = cardModel({ ...lvl, name: 'Rahul राहुल ★' }, ['name'])
  assert.equal(named.name, 'Rahul')
  // A headline that is nothing but unsupported characters is left out, not drawn blank.
  const ach: ShareData = { kind: 'achievement', name: 'A', title: '★ ✓', tier: 'gold', date: null }
  assert.equal(cardModel(ach, ['title', 'tier']).hero, null)
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

test('a review is of the week before its date: Sunday is that week, Monday is the one just gone', () => {
  assert.equal(reviewedWeekStart('2026-11-15'), '2026-11-09') // Sunday
  assert.equal(reviewedWeekStart('2026-11-16'), '2026-11-09') // Monday: covers the week that ended yesterday
  assert.equal(reviewedWeekStart('2026-11-18'), '2026-11-16') // Wednesday: the week so far
  assert.equal(reviewedWeekStart('2026-11-23'), '2026-11-16')
  assert.equal(reviewDateOf('review:2026-11-15'), '2026-11-15')
  assert.equal(reviewDateOf('review:abc'), undefined)
  assert.equal(reviewDateOf(undefined), undefined)
})

type Level = Extract<ShareData, { kind: 'level' }>

test('cardModel: level progress only when ticked and only for the level the user is on', () => {
  const now: Level = { kind: 'level', name: 'Alex', level: 7, title: 'Initiate', totalXp: 2950, areas: [{ label: 'Health', level: 4, area: 'health' }], next: { xpToGo: 1450, progress: 1.2, title: { level: 10, title: 'Pathfinder' } } }
  const m = cardModel(now, ['level', 'progress', 'areas'])
  assert.deepEqual(m.progress, { value: 1, line: '1,450 XP to level 8', next: 'Next title: Pathfinder at level 10' })
  assert.equal(m.stats[0].tone, 'health')
  assert.equal(cardModel(now, ['level']).progress, null)
  assert.equal(cardModel({ ...now, next: null }, ['level', 'progress']).progress, null)
  assert.equal(cardModel({ ...now, next: { ...now.next!, title: null } }, ['progress']).progress?.next, null)
})

test('shareText says only what the card shows, and never the name', () => {
  const lvl: Level = { kind: 'level', name: 'Alex', level: 7, title: 'Initiate', totalXp: 2950, areas: [] }
  assert.equal(shareText(cardModel(lvl, ['level', 'title', 'name']), 'Acme'), 'I reached level 7 on Acme: Initiate.')
  assert.equal(shareText(cardModel(lvl, ['level']), 'Acme'), 'I reached level 7 on Acme.')
  assert.equal(shareText(cardModel(lvl, ['title']), 'Acme'), 'New title on Acme: Initiate.')
  assert.equal(shareText(cardModel(lvl, []), 'Acme'), 'Levelling up my real life with Acme.')
  assert.equal(shareText(cardModel({ kind: 'streak', name: 'A', days: 30, best: 30, freezesUsed: 0 }, ['streak']), 'Acme'), '30 days in a row on Acme.')
  assert.equal(shareText(cardModel({ kind: 'achievement', name: 'A', title: 'Early bird', tier: 'gold', date: null }, ['title', 'tier']), 'Acme'), 'Achievement unlocked on Acme: Early bird (Gold medal).')
  assert.equal(shareText(cardModel(weekly, ['xp', 'days', 'quests']), 'Acme'), 'My week on Acme: +1,284 XP, 5 of 7 days shown up, quests cleared: 2.')
  for (const t of [shareText(cardModel(lvl, ['level', 'title', 'name']), 'Acme')]) assert.ok(!t.includes('Alex'))
})
