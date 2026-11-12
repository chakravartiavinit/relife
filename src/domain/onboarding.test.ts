import assert from 'node:assert/strict'
import { test } from 'node:test'
import { connectHow, halfHours, pickSources, startersOn } from './onboarding'

const src = (id: string, category: string | undefined, o: Partial<Parameters<typeof connectHow>[0]> = {}) =>
  ({ id, name: id, section: 'built-in', category, connected: false, fields: [{ secret: true }], ...o })
const user = { fields: [{ secret: false }] }

test('connectHow: a username is inline, a sign-in or browser login waits, anything else opens the dialog', () => {
  assert.equal(connectHow(src('a', 'skills', user)), 'inline')
  assert.equal(connectHow(src('b', 'health', { oauth: {} })), 'later')
  assert.equal(connectHow(src('c', 'wealth', { login: true, fields: [] })), 'later')
  assert.equal(connectHow(src('d', 'skills')), 'dialog')
  assert.equal(connectHow(src('e', 'health', { fields: [] })), 'dialog')
})

test('pickSources: only the picked areas, cheapest first, spread across areas, Telegram last, at most six', () => {
  const items = [
    src('github', 'skills'), src('codeforces', 'skills', user), src('leetcode', 'skills', user),
    src('lichess', 'hobbies', user), src('steam', 'hobbies'),
    src('oura', 'health', { oauth: {} }), src('icloud-inbox', 'health', { fields: [] }),
    src('swiggy', 'wealth', { login: true, fields: [] }), src('binance', 'wealth'),
    src('toggl', 'mind'),
    src('anthropic', undefined, { section: 'ai' }), src('telegram', undefined, { section: 'messaging' }),
  ]
  const ids = (areas: string[]) => pickSources(items, areas).map((c) => c.id)
  assert.deepEqual(ids(['skills', 'hobbies', 'health']), ['codeforces', 'lichess', 'icloud-inbox', 'leetcode', 'steam', 'telegram'])
  assert.deepEqual(ids(['wealth']), ['binance', 'swiggy', 'telegram'])
  assert.equal(ids(['skills', 'hobbies', 'health', 'wealth', 'mind']).length, 6)
  assert.equal(ids([]).join(), 'telegram')
})

test('pickSources: a connected source sinks below the ones still to do, and without Telegram all rows are sources', () => {
  const items = [src('codeforces', 'skills', { ...user, connected: true }), src('github', 'skills'), src('wakatime', 'skills'), src('x', 'skills'), src('y', 'skills'), src('z', 'skills'), src('w', 'skills')]
  const out = pickSources(items, ['skills']).map((c) => c.id)
  assert.equal(out.length, 6)
  assert.ok(!out.includes('codeforces'))
})

test('startersOn: the first three suggested routines the user does not have yet', () => {
  const list = [{ id: 'water', name: 'Drink water', suggested: true }, { id: 'a', name: 'A' }, { id: 'journal', name: 'Journal', suggested: true },
    { id: 'workout', name: 'Workout', suggested: true }, { id: 'budget', name: 'Review budget', suggested: true }]
  assert.deepEqual(startersOn(list, []), ['water', 'journal', 'workout'])
  assert.deepEqual(startersOn(list, ['journal']), ['water', 'workout', 'budget'])
  assert.deepEqual(startersOn([], []), [])
})

test('halfHours: 48 half hours, plus an odd saved time in its place', () => {
  const all = halfHours()
  assert.equal(all.length, 48)
  assert.equal(all[0], '00:00')
  assert.equal(all[47], '23:30')
  const odd = halfHours('07:15')
  assert.equal(odd.length, 49)
  assert.equal(odd[odd.indexOf('07:15') - 1], '07:00')
  assert.equal(halfHours('07:30').length, 48)
})
