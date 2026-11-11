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

test('checkKeys reports a wrong key but lets network trouble through', async () => {
  const { checkKeys } = await import('./secrets')
  const fail = (err: Error) => async () => { throw err }
  assert.equal(await checkKeys(fail(new Error('The key was rejected. Check it on Connectors, or make a new one.')), () => undefined), 'The key was rejected. Check it on Connectors, or make a new one.')
  assert.equal(await checkKeys(fail(new Error('Not found. Check the username.')), () => undefined), 'Not found. Check the username.')
  assert.equal(await checkKeys(fail(new TypeError('fetch failed')), () => undefined), undefined)
  assert.equal(await checkKeys(fail(Object.assign(new Error('aborted'), { name: 'TimeoutError' })), () => undefined), undefined)
  assert.equal(await checkKeys(fail(new Error('Rate limited. It will try again on the next sync.')), () => undefined), undefined)
  assert.equal(await checkKeys(fail(new Error('HTTP 503')), () => undefined), undefined)
  assert.equal(await checkKeys(fail(new SyntaxError("Unexpected token '<'")), () => undefined), undefined) // a portal page, not a wrong key
  // The check reads the values being saved.
  let seen: string | undefined
  assert.equal(await checkKeys(async (get) => { seen = get('X') }, (k) => (k === 'X' ? 'typed' : undefined)), undefined)
  assert.equal(seen, 'typed')
})
