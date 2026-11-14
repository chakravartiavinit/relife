import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Pack, PACK_CATEGORIES, parsePack } from '@relife/contract'
import { connectors } from '@/connectors'
import { IMPROVE } from '@/ui/components/onboarding-data'
import { BUILT_IN_PACKS } from '@/packs'
import { CATEGORIES } from './categories'
import { checkGoalDraft } from './goals'
import { addedLine, applyPack, packGoalToRaw, planPack, templateToPackRoutine, type PackAnswers, type PackState } from './packs'
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

test('the Fitness pack asks for the same steps its goal counts', () => {
  const fit = BUILT_IN_PACKS.find((p) => p.id === 'fitness')!
  assert.ok(fit.goals[0].title.includes(fit.targets!.steps!.toLocaleString('en-US')), 'the goal names the steps target')
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
  assert.equal(fit.steps, 8000)
  const money = applyPack(fit, pack('money'))
  assert.deepEqual([money.areas, money.templates, money.pack], [['wealth'], ['budget', 'log-spends', 'save', 'no-spend-day'], 'money'])
  assert.deepEqual([money.steps, money.sleepHours], [8000, 7.5], 'Money sets no targets, so the earlier ones stay')
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

// ─── The templates gallery: planPack ───

const TODAY = '2026-11-14'
const noState = (o: Partial<PackState> = {}): PackState => ({ routineNames: new Set(), routineIds: new Map(), trackers: new Map(), goalTitles: new Set(), activeGoals: 0, areas: [], ...o })
const keys = (l: { key: string }[]) => l.map((x) => x.key)

test('planPack: a new user gets every routine, and the goal that links two of them', () => {
  const plan = planPack(pack('fitness'), noState(), TODAY)
  assert.deepEqual(keys(plan.routines), ['workout', 'stretch', 'evening-walk', 'water'])
  assert.deepEqual(keys(plan.goals), ['active-days'])
  assert.deepEqual(plan.skip, [])
  assert.deepEqual(plan.areasToAdd, [])
})

test('planPack: running it again adds nothing, and each skipped item says why', () => {
  const have = noState({ routineNames: new Set(['workout', 'stretch', 'evening walk', 'drink water']), routineIds: new Map([['workout', 'a'], ['evening-walk', 'b']]), goalTitles: new Set(['walk 8,000 steps on five days a week']) })
  const plan = planPack(pack('fitness'), have, TODAY)
  assert.deepEqual([plan.routines, plan.trackers, plan.targets, plan.goals], [[], [], [], []])
  assert.deepEqual(plan.skip.map((s) => s.reason), ['exists', 'exists', 'exists', 'exists', 'exists'])
})

test('planPack: an existing routine with the pack goal\'s name still lets the goal link it', () => {
  const have = noState({ routineNames: new Set(['workout', 'evening walk']), routineIds: new Map([['workout', 'a'], ['evening walk', 'b']]) })
  assert.deepEqual(keys(planPack(pack('fitness'), have, TODAY).goals), ['active-days'])
})

test('planPack: the goal slots are respected and the goal is skipped with that reason', () => {
  const plan = planPack(pack('fitness'), noState({ activeGoals: 3 }), TODAY)
  assert.deepEqual(plan.goals, [])
  assert.deepEqual(plan.skip, [{ kind: 'goal', key: 'active-days', name: 'Walk 8,000 steps on five days a week', reason: 'goal_slots' }])
  assert.equal(planPack(pack('fitness'), noState({ activeGoals: 2 }), TODAY).goals.length, 1)
})

test('planPack: an area the user has off is skipped, or added with the area when they allow it', () => {
  const state = noState({ areas: ['mind'] })
  const off = planPack(pack('fitness'), state, TODAY, { addAreas: false })
  assert.deepEqual([off.routines.length, off.goals.length], [0, 0])
  assert.ok(off.skip.every((s) => s.reason === 'area_off'))
  const on = planPack(pack('fitness'), state, TODAY, { addAreas: true })
  assert.equal(on.routines.length, 4)
  assert.deepEqual(on.areasToAdd, ['health'])
  assert.equal(planPack(pack('fitness'), noState(), TODAY).areasToAdd.length, 0) // no areas chosen means all of them are on
})

test('planPack: choices narrow what is added; a goal whose routine was not picked is skipped', () => {
  const plan = planPack(pack('fitness'), noState(), TODAY, { routineKeys: ['stretch'], goalKeys: ['active-days'] })
  assert.deepEqual(keys(plan.routines), ['stretch'])
  assert.deepEqual(plan.skip.map((s) => s.reason), ['no_action'])
})

test('planPack: a goal on a tracker needs that tracker, from the pack or from the user; a target is set only where there is none', () => {
  const p = Pack.parse({
    format: 'relife.pack', version: 1, id: 'x', name: 'X', description: 'x', areas: ['health'],
    routines: [{ key: 'walk', name: 'Walk', area: 'health', kind: 'routine', rule: { freq: 'daily', times: ['07:00'] } }],
    trackers: [{ slug: 'steps', name: 'Steps', area: 'health', kind: 'number', target: 9000, direction: 'up', aggregate: 'sum' }],
    goals: [{ key: 'g', title: 'More steps', reason: 'r', area: 'health', measure: { tracker: 'steps' }, direction: 'up', target: 9000, weeks: 6, cadence: 'weekly', actions: ['walk'] }],
  })
  const fresh = planPack(p, noState(), TODAY)
  assert.deepEqual([fresh.trackers.map((x) => x.slug), keys(fresh.goals)], [['steps'], ['g']])
  const t = (target: number | null) => new Map([['steps', { id: 'i', name: 'Steps', unit: null, category: 'health' as const, target }]])
  assert.deepEqual(planPack(p, noState({ trackers: t(null) }), TODAY).targets.map((x) => x.slug), ['steps'])
  const kept = planPack(p, noState({ trackers: t(5000) }), TODAY)
  assert.deepEqual(kept.targets, [])
  assert.deepEqual(kept.skip.map((s) => s.reason), ['exists'])
  const none = planPack(p, noState(), TODAY, { trackerSlugs: [] })
  assert.deepEqual(none.skip.map((s) => s.reason), ['unknown_tracker'])
})

test('planPack: a goal the sensitivity rules refuse is left out', () => {
  const p = Pack.parse({
    format: 'relife.pack', version: 1, id: 'x', name: 'X', description: 'x', areas: ['health'],
    routines: [{ key: 'eat', name: 'Eat', area: 'health', kind: 'routine', rule: { freq: 'daily', times: ['07:00'] } }],
    trackers: [],
    goals: [{ key: 'g', title: 'Lose 10 kg', reason: 'r', area: 'health', measure: { checkIn: 'Weight', unit: 'kg' }, direction: 'down', target: 60, weeks: 8, cadence: 'weekly', actions: ['eat'] }],
  })
  assert.deepEqual(planPack(p, noState(), TODAY).skip.map((s) => s.reason), ['not_allowed'])
})

test('planPack and templateToPackRoutine: the setup templates are pack routines with the same rule', () => {
  for (const t of TEMPLATES) {
    const r = templateToPackRoutine(t)
    assert.equal(r.key, t.id)
    assert.equal(r.name, t.name)
    assert.equal(r.rule.freq, t.rule.freq)
  }
})

test('addedLine: the toast after adding names what was added and never "0 goals"', () => {
  assert.equal(addedLine({ routines: 4, trackers: 0, goals: 1 }), 'Added 4 routines, 1 goal')
  assert.equal(addedLine({ routines: 1, trackers: 2, goals: 0 }), 'Added 1 routine, 2 trackers')
  assert.equal(addedLine({ routines: 0, trackers: 0, goals: 0 }), 'Nothing new to add')
})

test('every community pack plans cleanly for a new user: all routines and goals can be added', async () => {
  const { readdirSync, readFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const dir = join(process.cwd(), '../../community/packs')
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json') && x !== 'index.json')) {
    const r = parsePack(readFileSync(join(dir, f), 'utf8'))
    assert.ok(r.ok, f)
    const plan = planPack(r.pack, noState(), TODAY)
    assert.deepEqual(plan.skip, [], f)
    assert.equal(plan.routines.length, r.pack.routines.length, f)
    assert.equal(plan.goals.length, r.pack.goals.length, f)
  }
})
