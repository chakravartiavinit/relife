import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { PartyMemberView } from '@relife/contract'
import {
  cheerRef, cheerText, cleanShare, daysBefore, DEFAULT_PARTY_SHARE, factsNeeded, isoWeek, joinOrder, memberView, onTrack, partyChestRef,
  PARTY_QUEST, questState, type MemberFacts,
} from './party'

const everything = { name: true, level: true, streak: true, today: true, quests: true, achievements: true }
const nothing = { name: false, level: false, streak: false, today: false, quests: false, achievements: false }
const facts: MemberFacts = {
  name: 'Asha', level: { level: 12, title: 'Adept' }, streak: 9, today: { done: 3, total: 5 }, quests: [40, 100], achievements: ['First week'],
}
const view = (share: typeof everything, o: Partial<Parameters<typeof memberView>[0]> = {}) =>
  memberView({ id: 'm1', you: false, status: 'active', share, facts, days: 4, before: 5, ...o })

describe('what a member shares', () => {
  test('a member who ticked everything shows everything, as the contract shape', () => {
    const v = view(everything)
    assert.deepEqual(PartyMemberView.parse(v), v)
    assert.equal(v.name, 'Asha')
    assert.deepEqual(v.level, { level: 12, title: 'Adept' })
    assert.equal(v.streak, 9)
    assert.deepEqual(v.today, { done: 3, total: 5 })
    assert.deepEqual(v.quests, [40, 100])
    assert.deepEqual(v.achievements, ['First week'])
    assert.equal(v.week.days, 4)
  })

  test('a member who shares nothing is all null, but still counts toward the party quest', () => {
    const v = view(nothing, { days: 5 })
    assert.deepEqual([v.name, v.level, v.streak, v.today, v.quests, v.achievements, v.week.days], [null, null, null, null, null, null, null])
    assert.equal(v.week.onTrack, true)
  })

  test('each tick opens exactly its own field', () => {
    for (const key of Object.keys(everything) as (keyof typeof everything)[]) {
      const v = view({ ...nothing, [key]: true })
      const shown = (['name', 'level', 'streak', 'today', 'quests', 'achievements'] as const).filter((f) => v[f] !== null)
      assert.deepEqual(shown, [key], key)
    }
  })

  test('the view has no field beyond the contract: extra facts cannot leak', () => {
    const leaky = { ...facts, email: 'a@b.c', balance: 9999, routines: ['Pill'] } as MemberFacts
    const v = view(everything, { facts: leaky })
    assert.deepEqual(Object.keys(v).sort(), ['achievements', 'id', 'level', 'name', 'quests', 'status', 'streak', 'today', 'week', 'you'])
    assert.ok(!JSON.stringify(v).includes('9999') && !JSON.stringify(v).includes('a@b.c') && !JSON.stringify(v).includes('Pill'))
  })

  test('quest percentages are clamped to 0..100 whatever the loader gave', () => {
    assert.deepEqual(view(everything, { facts: { ...facts, quests: [-5, 130.4, 49.6] } }).quests, [0, 100, 50])
  })

  test('an invitee shows a name only: they have chosen nothing yet', () => {
    const v = view(everything, { status: 'invited' })
    assert.equal(v.name, 'Asha')
    assert.deepEqual([v.level, v.streak, v.today, v.quests, v.achievements, v.week.days, v.week.onTrack], [null, null, null, null, null, null, false])
  })

  test('another person’s name is cut to 60 characters', () => {
    assert.equal(view(everything, { facts: { ...facts, name: 'x'.repeat(200) } }).name?.length, 60)
  })

  test('the default share is name and level only', () => {
    assert.deepEqual(DEFAULT_PARTY_SHARE, { ...nothing, name: true, level: true })
  })

  test('cleanShare keeps the six ticks and drops everything else', () => {
    assert.deepEqual(cleanShare({ name: true, level: 'yes', streak: 1, admin: true }), { ...nothing, name: true })
    assert.deepEqual(cleanShare(null), nothing)
    assert.deepEqual(cleanShare('x'), nothing)
  })

  test('only what was ticked is loaded', () => {
    assert.deepEqual(factsNeeded(nothing), { level: false, streak: false, today: false, quests: false, achievements: false })
    assert.deepEqual(factsNeeded({ ...nothing, streak: true }), { level: false, streak: true, today: false, quests: false, achievements: false })
  })
})

describe('the weekly party quest', () => {
  test('on track follows the pace to 5 of 7 days', () => {
    assert.equal(onTrack(0, 0), true) // Monday
    assert.equal(onTrack(0, 2), false) // Wednesday morning, nothing yet: floor(10/7) = 1 needed
    assert.equal(onTrack(1, 2), true)
    assert.equal(onTrack(2, 4), true) // Friday morning: 2 needed
    assert.equal(onTrack(1, 4), false)
    assert.equal(onTrack(4, 7), false) // the week is over: all 5
    assert.equal(onTrack(5, 7), true)
  })

  test('cleared when every counted member showed up on 5 days', () => {
    const s = questState([{ days: 5, fromStart: true }, { days: 6, fromStart: true }], 7)
    assert.deepEqual(s, { onTrack: 2, members: 2, cleared: true })
    assert.equal(questState([{ days: 5, fromStart: true }, { days: 4, fromStart: true }], 7).cleared, false)
  })

  test('one person is never a party: not cleared', () => {
    assert.equal(questState([{ days: 7, fromStart: true }], 7).cleared, false)
  })

  test('someone who joined mid-week is not counted until next week', () => {
    const s = questState([{ days: 5, fromStart: true }, { days: 5, fromStart: true }, { days: 0, fromStart: false }], 7)
    assert.deepEqual(s, { onTrack: 2, members: 2, cleared: true })
  })

  test('the quest is fixed and says what it asks', () => {
    assert.equal(PARTY_QUEST.target, 5)
    assert.match(PARTY_QUEST.title, /5 of 7/)
  })

  test('ISO weeks, including the year edges', () => {
    assert.equal(isoWeek('2026-11-09'), '2026-W46')
    assert.equal(isoWeek('2024-12-30'), '2025-W01') // the Thursday is in 2025
    assert.equal(isoWeek('2021-01-04'), '2021-W01')
    assert.equal(isoWeek('2020-12-28'), '2020-W53')
  })

  test('the chest ref is per week, not per party: one chest a week however many parties', () => {
    assert.equal(partyChestRef('2026-11-09'), 'party:2026-W46')
    assert.notEqual(partyChestRef('2026-11-09'), partyChestRef('2026-11-16'))
  })

  test('days before today, Monday first', () => {
    assert.equal(daysBefore('2026-11-09'), 0) // Monday
    assert.equal(daysBefore('2026-11-14'), 5) // Saturday
    assert.equal(daysBefore('2026-11-15'), 6) // Sunday
  })
})

describe('cheers and order', () => {
  test('a cheer is one ref per pair per day', () => {
    assert.equal(cheerRef('a', 'b', '2026-11-14'), cheerRef('a', 'b', '2026-11-14'))
    assert.notEqual(cheerRef('a', 'b', '2026-11-14'), cheerRef('b', 'a', '2026-11-14'))
    assert.notEqual(cheerRef('a', 'b', '2026-11-14'), cheerRef('a', 'b', '2026-11-15'))
  })

  test('a cheer from someone who hides their name says Someone', () => {
    assert.equal(cheerText('Asha', 'Morning crew'), 'Asha cheered you on in Morning crew')
    assert.equal(cheerText(null, 'Morning crew'), 'Someone cheered you on in Morning crew')
  })

  test('members are ordered by when they joined, not by score', () => {
    const rows = [{ id: 'c', joined: '2026-02-01' }, { id: 'a', joined: '2026-01-01' }, { id: 'b', joined: '2026-01-01' }]
    assert.deepEqual(joinOrder(rows).map((r) => r.id), ['a', 'b', 'c'])
  })
})
