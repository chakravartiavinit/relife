import { test } from 'node:test'
import assert from 'node:assert/strict'
import nextConfig from '../../next.config'
import { AREA_HREF, FOOTER, PLAY, STATS, TABS, isActive } from './nav-model'

const item = (href: string) => [...PLAY, ...STATS, ...FOOTER].find((i) => i.href === href)!

test('isActive keeps Today exact and lights parents on nested routes', () => {
  assert.equal(isActive('/', item('/')), true)
  assert.equal(isActive('/routines', item('/')), false)
  assert.equal(isActive('/routines/trackers/water', item('/routines')), true)
  assert.equal(isActive('/coach/screen-time', item('/coach')), true)
  assert.equal(isActive('/sources/review', item('/sources')), true)
  assert.equal(isActive('/sources/browse', item('/sources')), true)
  assert.equal(isActive('/wealth/spending', item('/wealth')), true)
  // A shared prefix that is not a path segment does not count.
  assert.equal(isActive('/coaching', item('/coach')), false)
  assert.equal(isActive('/settings', item('/sources')), false)
})

test('People lives at /people while its category key stays relationships', () => {
  assert.equal(AREA_HREF.relationships, '/people')
  assert.equal(STATS.length, 6)
  for (const tabs of Object.values(TABS)) for (const t of tabs) assert.match(t.href, /^\/[a-z/-]+$/)
})

test('old URLs redirect with 307 to the new routes', async () => {
  const rules = await nextConfig.redirects!()
  const to = (source: string, query?: string) =>
    rules.find((r) => r.source === source && (query ? r.has?.some((h) => h.type === 'query' && h.value === query) : !r.has))
  const expected: Record<string, string> = {
    '/profile': '/character', '/overview': '/character', '/habits': '/routines', '/schedules': '/routines',
    '/trackers': '/routines/trackers', '/trackers/:slug': '/routines/trackers/:slug', '/insights': '/coach',
    '/activity': '/coach/screen-time', '/connectors': '/sources', '/inbox': '/sources/review', '/relationships': '/people',
  }
  for (const [source, destination] of Object.entries(expected)) {
    const rule = to(source)
    assert.ok(rule, `missing redirect for ${source}`)
    assert.equal(rule.destination, destination)
    assert.equal(rule.permanent, false)
  }
  assert.equal(to('/habits', 'trackers')?.destination, '/routines/trackers')
  // The trackers rule must come before the plain /habits rule, or it never matches.
  const idx = (q?: string) => rules.indexOf(to('/habits', q)!)
  assert.ok(idx('trackers') < idx())
  // Exact source only: /connectors/<logo>.svg must keep loading.
  assert.ok(!rules.some((r) => r.source.startsWith('/connectors/') || r.source.includes('/connectors/:')))
})
