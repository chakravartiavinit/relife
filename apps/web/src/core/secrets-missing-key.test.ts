import assert from 'node:assert/strict'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

// Lost data folder with saved keys: report it, keep running, never write a replacement key.
// Own file (own process): another test that finds nothing saved would allow creating a key.

delete process.env.RELIFE_SECRET_KEY
const dir = mkdtempSync(join(tmpdir(), 'relife-data-'))
process.env.RELIFE_DATA_DIR = dir

test('with saved keys and no key file: a message, no throw, and no new key is written', async () => {
  const { keyProblem, encrypt, decrypt } = await import('./secrets')
  const problem = await keyProblem(async () => true)
  assert.match(problem ?? '', /secret\.key is missing[\s\S]*will not create a new key/)
  assert.throws(() => encrypt({ A: '1' }), /secret\.key is missing/)
  assert.throws(() => decrypt(Buffer.alloc(40)), /secret\.key is missing/)
  assert.equal(existsSync(join(dir, 'secret.key')), false)
})

test('nothing saved: the first use creates the key', async () => {
  const { keyProblem, encrypt, decrypt } = await import('./secrets')
  assert.equal(await keyProblem(async () => false), null)
  assert.deepEqual(decrypt(encrypt({ A: '1' })), { A: '1' })
  assert.equal(existsSync(join(dir, 'secret.key')), true)
})
