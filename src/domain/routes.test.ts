import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AREA_SLUGS, LEGACY_REDIRECTS, ROUTES, fitsPattern, matchRoute, pathOf, trail } from './routes'

const legacy = (path: string) => LEGACY_REDIRECTS.some((r) => fitsPattern(r.source, path))

test('each legacy rule appears once (a `has` rule and its plain twin count as two)', () => {
  const keys = LEGACY_REDIRECTS.map((r) => `${r.source}|${JSON.stringify(r.has ?? null)}`)
  assert.equal(new Set(keys).size, keys.length)
  for (const r of LEGACY_REDIRECTS.filter((r) => !r.has)) assert.equal(LEGACY_REDIRECTS.filter((x) => x.source === r.source && !x.has).length, 1, r.source)
})

test('no destination is itself a legacy source (no chains)', () => {
  for (const r of LEGACY_REDIRECTS) {
    const to = pathOf(r.destination)
    const concrete = to.replace(/:[a-z]+/gi, 'x')
    assert.ok(!legacy(concrete), `${r.source} → ${to} is redirected again`)
  }
})

test('every destination is a known route', () => {
  const paths = new Set(ROUTES.map((r) => r.path))
  for (const r of LEGACY_REDIRECTS) assert.ok(paths.has(pathOf(r.destination)), `${r.destination} is not in ROUTES`)
})

test('/habits?tab=trackers comes before plain /habits', () => {
  const at = (pred: (r: (typeof LEGACY_REDIRECTS)[number]) => boolean) => LEGACY_REDIRECTS.findIndex(pred)
  const withTab = at((r) => r.source === '/habits' && !!r.has)
  const plain = at((r) => r.source === '/habits' && !r.has)
  assert.ok(withTab >= 0 && plain >= 0 && withTab < plain)
  assert.equal(LEGACY_REDIRECTS[withTab].destination, '/plan/trackers')
  assert.equal(LEGACY_REDIRECTS[plain].destination, '/plan/routines')
})

test('/goals/review is listed before /goals/:id, which would swallow it', () => {
  const i = (s: string) => LEGACY_REDIRECTS.findIndex((r) => r.source === s)
  assert.ok(i('/goals/review') < i('/goals/:id'))
})

test('routes are unique, parents exist, areas are covered', () => {
  const paths = ROUTES.map((r) => r.path)
  assert.equal(new Set(paths).size, paths.length)
  for (const r of ROUTES) if (r.parent) assert.ok(paths.includes(r.parent), `${r.path} parent ${r.parent}`)
  for (const a of AREA_SLUGS) for (const sub of ['', '/trends', '/routines', '/sources']) assert.ok(paths.includes(`/${a}${sub}`))
})

test('matchRoute and trail', () => {
  assert.equal(matchRoute('/plan/goals/abc-123')?.path, '/plan/goals/:id')
  assert.equal(matchRoute('/plan/')?.path, '/plan')
  assert.equal(matchRoute('/nope'), null)
  assert.deepEqual(trail('/wealth/spending').map((r) => r.label), ['Life', 'Wealth', 'Spending'])
  assert.deepEqual(trail('/plan/trackers/water').map((r) => r.label), ['Plan', 'Trackers', 'Tracker'])
  assert.deepEqual(trail('/'), [{ path: '/', label: 'Today' }])
})

// Links in src/ that still point at an old path. Phase 2 moves the pages and brings this to 0; until
// then the count may only go down. Lower the baseline whenever you fix some.
const LEGACY_LINK_BASELINE = 62

function* sources(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'beui') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) yield* sources(p)
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !p.endsWith('domain/routes.ts')) yield p
  }
}

test('links in src/ do not point at old paths', () => {
  // href="/goals", href: '/goals/x', href={`/trackers/${slug}`}, push('/habits?tab=trackers'), redirect('/inbox')
  const link = /(?:href\s*[=:]\s*\{?\s*|\b(?:push|replace|redirect)\(\s*)(["'`])(\/[^"'`]*)\1/g
  const hits: string[] = []
  for (const f of sources('src')) {
    for (const m of readFileSync(f, 'utf8').matchAll(link)) {
      const path = pathOf(m[2].replace(/\$\{[^}]*\}/g, 'x')) || '/'
      if (legacy(path)) hits.push(`${f}: ${m[2]}`)
    }
  }
  assert.ok(hits.length <= LEGACY_LINK_BASELINE, `${hits.length} old links (limit ${LEGACY_LINK_BASELINE}):\n${hits.join('\n')}`)
})
