import { test } from 'node:test'
import assert from 'node:assert/strict'
import { requestOrigin } from './oauth'

const h = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null })

test('requestOrigin uses the Host the browser used, not localhost', () => {
  assert.equal(requestOrigin(h({ host: '127.0.0.1:3030' })), 'http://127.0.0.1:3030')
})

test('requestOrigin prefers the forwarded address behind an https tunnel', () => {
  assert.equal(requestOrigin(h({ host: '127.0.0.1:3030', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'mac.tail.ts.net' })), 'https://mac.tail.ts.net')
})

test('requestOrigin takes the first value when proxies chain them', () => {
  assert.equal(requestOrigin(h({ host: '127.0.0.1:3030', 'x-forwarded-proto': 'https, http', 'x-forwarded-host': 'mac.tail.ts.net, proxy' })), 'https://mac.tail.ts.net')
})
