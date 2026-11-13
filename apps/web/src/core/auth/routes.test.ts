import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { test } from 'node:test'
import { isPublicPath } from './trust'

// Defense in depth: the edge (gate.ts) opens a request on any valid token, so every route handler has to check the
// token's scope itself. This lists every app/**/route.ts and fails when one neither is on the public list nor calls
// authenticate() (directly or through a src/core/v1 handler that does), so a new route cannot ship open by accident.

const root = join(import.meta.dirname, '../../app')
const routes: string[] = []
const walk = (dir: string) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p)
    else if (f === 'route.ts') routes.push(p)
  }
}
walk(root)

const urlOf = (file: string) => '/' + relative(root, file).split(sep).slice(0, -1).map((s) => (s.startsWith('[') ? 'x' : s)).join('/')
const authenticates = (src: string) => /\bauthenticate\(/.test(src)

test('there are routes to check', () => assert.ok(routes.length > 15))

test('every route handler is public on purpose or authenticates', () => {
  const open: string[] = []
  for (const file of routes) {
    const url = urlOf(file)
    if (isPublicPath(url) || url === '/api/health') continue
    const src = readFileSync(file, 'utf8')
    if (authenticates(src)) continue
    // A thin alias (/api/companion, /api/activity): its handlers live in src/core/v1 and must authenticate.
    const delegated = [...src.matchAll(/from '@\/core\/v1\/([\w-]+)'/g)].map((m) => readFileSync(join(import.meta.dirname, '../v1', `${m[1]}.ts`), 'utf8'))
    if (delegated.length && delegated.every(authenticates)) continue
    open.push(`${url} (${relative(root, file)})`)
  }
  assert.deepEqual(open, [], 'these routes are reachable with any valid token and never check its scope')
})

test('the public routes are the ones meant to be', () => {
  const pub = routes.map(urlOf).filter((u) => isPublicPath(u) || u === '/api/health').sort()
  assert.deepEqual(pub, ['/api/health', '/api/v1/hello', '/api/v1/pair/redeem', '/api/v1/pair/requests', '/api/v1/pair/requests/x/poll'])
})
