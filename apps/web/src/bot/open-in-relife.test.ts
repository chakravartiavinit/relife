import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { keyboard } from '@/core/notify'
import { openInReLife } from './ui'

const saved = process.env.RELIFE_PUBLIC_URL
afterEach(() => { if (saved === undefined) delete process.env.RELIFE_PUBLIC_URL; else process.env.RELIFE_PUBLIC_URL = saved })

test('without RELIFE_PUBLIC_URL there is no button', () => {
  delete process.env.RELIFE_PUBLIC_URL
  assert.deepEqual(openInReLife('/coach'), [])
})

test('with it, one URL button; a trailing slash is dropped', () => {
  process.env.RELIFE_PUBLIC_URL = 'https://mac.tail1234.ts.net/'
  assert.deepEqual(openInReLife('/coach', 'Open Coach'), [[{ text: '↗ Open Coach', url: 'https://mac.tail1234.ts.net/coach' }]])
})

test('something that is not an http address is ignored', () => {
  process.env.RELIFE_PUBLIC_URL = 'mac.local'
  assert.deepEqual(openInReLife('/coach'), [])
})

test('a URL button becomes a url button, a callback button stays one', () => {
  const kb = keyboard([[{ text: 'Got it', data: 'a:k:1' }], [{ text: 'Open', url: 'https://x.test/coach' }]])
  const rows = kb!.inline_keyboard
  assert.equal('callback_data' in rows[0][0], true)
  assert.equal('url' in rows[1][0], true)
})
