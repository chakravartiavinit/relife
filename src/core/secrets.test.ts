import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'

process.env.RELIFE_SECRET_KEY = randomBytes(32).toString('base64')

test('saved keys round-trip and tampering is rejected', async () => {
  const { encrypt, decrypt } = await import('./secrets')
  const buf = encrypt({ GITHUB_TOKEN: 'ghp_test', GITHUB_USER: 'me' })
  assert.ok(!buf.toString('latin1').includes('ghp_test'))
  assert.deepEqual(decrypt(buf), { GITHUB_TOKEN: 'ghp_test', GITHUB_USER: 'me' })
  buf[buf.length - 1] ^= 1
  assert.throws(() => decrypt(buf))
})
