import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Pack, PACK_CATEGORIES } from '@relife/contract'
import { connectors } from '@/connectors'
import { IMPROVE } from '@/ui/components/onboarding-data'
import { BUILT_IN_PACKS } from '@/packs'
import { CATEGORIES } from './categories'
import { checkGoalDraft } from './goals'
import { applyPack, packGoalToRaw, type PackAnswers } from './packs'
import { addDays } from '@/core/time'
import { pickSources } from './onboarding'
import { TEMPLATES } from './templates'

const base: PackAnswers = {
  areas: ['health'], improve: [], templates: [], routineMode: null, starterSeeded: false, sleepHours: 7.5, sleepTouched: false, steps: 8000, waterMl: 2500, pack: null,
}
const pack = (id: string) => BUILT_IN_PACKS.find((p) => p.id === id)!

test('the contract and the web app list the same categories', () => {
  assert.deepEqual([...PACK_CATEGORIES], [...CATEGORIES])
})

test('there are four built-in packs and each one is a valid relifePack v1', () => {
  assert.deepEqual(BUILT_IN_PACKS.map((p) => p.id), ['fitness', 'money', 'student-dev', 'recovery'])
  for (const p of BUILT_IN_PACKS) assert.equal(Pack.safeParse(p).success, true, p.id)
})

test('every id a pack names exists: routines (and their rule), improve picks, sources, goal actions', () => {
  const connectorIds = new Set(connectors.map((c) => c.id))
  for (const p of BUILT_IN_PACKS) {
    for (const r of p.routines) {
      const t = TEMPLATES.find((x) => x.id === r.key)
      assert.ok(t, `${p.id}: no routine template ${r.key}`)
      assert.deepEqual({ name: r.name, area: r.area, kind: r.kind, rule: r.rule, note: r.note, dose: r.dose, quantity: r.quantity },
        { name: t.name, area: t.area, kind: t.kind, rule: Object.fromEntries(Object.entries(t.rule).filter(([, v]) => v !== undefined)), note: t.note, dose: t.dose, quantity: t.quantity }, `${p.id}/${r.key} drifted from the template`)
    }
    for (const id of p.improve ?? []) assert.ok(IMPROVE.some((i) => i.id === id), `${p.id}: unknown improve id ${id}`)
    for (const id of p.sources ?? []) assert.ok(connectorIds.has(id), `${p.id}: unknown source ${id}`)
    for (const g of p.goals) for (const a of g.actions ?? []) assert.ok(p.routines.some((r) => r.key === a) || p.trackers.some((t) => t.slug === a), `${p.id}: goal action ${a}`)
    for (const id of p.improve ?? []) {
      const area = IMPROVE.find((i) => i.id === id)!.area
      assert.ok(p.areas?.includes(area), `${p.id}: improve pick ${id} is in ${area}, which the pack does not turn on`)
    }
  }
})

test('every pack goal passes checkGoalDraft, which also enforces the sensitivity rules', () => {
  const today = '2026-11-13'
  for (const p of BUILT_IN_PACKS) {
    assert.equal(p.goals.length, 1, p.id)
    const routines = p.routines.map((r) => ({ id: r.key, name: r.name, category: r.area }))
    const r = checkGoalDraft(packGoalToRaw(p.goals[0], today, (k) => k), { today, trackers: [], routines })
    assert.equal(r.ok, true, `${p.id}: ${r.ok ? '' : r.reason}`)
    if (r.ok) assert.equal(r.draft.targetDate, addDays(today, p.goals[0].weeks * 7))
  }
})

test('a pack goal is a check-in measure with a baseline the user types, never a tracker the user lacks', () => {
  for (const p of BUILT_IN_PACKS) assert.ok('checkIn' in p.goals[0].measure, p.id)
  const raw = packGoalToRaw(pack('money').goals[0], '2026-11-13', () => undefined)
  assert.equal(raw.actions.length, 0)
  assert.equal(raw.direction, 'decrease')
  assert.equal(raw.targetDate, '2027-01-08')
})

test('the Recovery pack uses no medical or addiction wording', () => {
  const text = JSON.stringify(pack('recovery')).toLowerCase()
  for (const w of ['addict', 'detox', 'withdraw', 'sober', 'relapse', 'medic', 'therapy', 'depress', 'anxiety', 'mood', 'disorder', 'craving']) assert.ok(!text.includes(w), w)
  assert.ok(text.includes('rest and reset'))
})

test('applyPack fills the answers the flow asks for', () => {
  const v = applyPack(base, pack('recovery'))
  assert.deepEqual(v.areas, ['health', 'mind', 'relationships'])
  assert.deepEqual(v.improve, ['tracker:sleep.hours', 'tracker:screen.social', 'routines'])
  assert.deepEqual(v.templates, ['wind-down', 'lights-out', 'daylight-walk', 'call-parents'])
  assert.deepEqual([v.routineMode, v.starterSeeded, v.sleepHours, v.sleepTouched, v.steps, v.waterMl, v.pack, v.focus], ['starter', true, 8, true, 6000, 2500, 'recovery', 'health'])
})

test('switching packs applies the new one over the old; a pack without targets keeps them; Custom keeps everything', () => {
  const fit = applyPack(base, pack('fitness'))
  assert.equal(fit.steps, 10000)
  const money = applyPack(fit, pack('money'))
  assert.deepEqual([money.areas, money.templates, money.pack], [['wealth'], ['budget', 'log-spends', 'save', 'no-spend-day'], 'money'])
  assert.deepEqual([money.steps, money.sleepHours], [10000, 7.5], 'Money sets no targets, so the earlier ones stay')
  const custom = applyPack(money, null)
  assert.deepEqual({ ...custom, pack: money.pack }, money)
  assert.equal(custom.pack, null)
})

test('a rerun passes the saved areas and the pack adds to them', () => {
  const v = applyPack({ ...base, areas: ['wealth'] }, pack('recovery'), ['wealth', 'hobbies'])
  assert.deepEqual(v.areas, ['wealth', 'hobbies', 'health', 'mind', 'relationships'])
  assert.deepEqual(applyPack(base, pack('recovery'), ['health']).areas, ['health', 'mind', 'relationships'])
})

test('pickSources puts a pack\'s sources first, keeps Telegram last and fills the rest as before', () => {
  const src = (id: string, category: string, extra: object = {}) => ({ id, name: id, section: category, category, connected: false, fields: [{ secret: true }], ...extra })
  const items = [src('strava', 'health'), src('hevy', 'health'), src('oura', 'health'), src('whoop', 'health'), src('github', 'skills'), src('lastfm', 'hobbies'), src('telegram', 'messaging', { category: undefined }), src('claude', 'ai')]
  const plain = pickSources(items, ['health', 'skills'])
  assert.equal(plain.at(-1)!.id, 'telegram')
  const ids = pickSources(items, ['health', 'skills'], 6, ['whoop', 'strava', 'nope', 'claude', 'telegram']).map((c) => c.id)
  assert.deepEqual(ids.slice(0, 2), ['whoop', 'strava'])
  assert.equal(ids.at(-1), 'telegram')
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(!ids.includes('claude') && !ids.includes('nope'))
  assert.ok(ids.length <= 6)
})
