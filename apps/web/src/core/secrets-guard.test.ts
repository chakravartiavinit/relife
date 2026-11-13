import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

// A missing key file next to saved keys must be an error, never a silent new key.

delete process.env.RELIFE_SECRET_KEY

test('missing key file with saved keys throws a clear error', async () => {
  const { assertKeyReady } = await import('./secrets')
  const file = join(mkdtempSync(join(tmpdir(), 'relife-key-')), 'secret.key')
  await assert.rejects(assertKeyReady(async () => true, file), /missing[\s\S]*will not create a new key/)
})

test('missing key file with nothing saved is fine (first run creates it)', async () => {
  const { assertKeyReady } = await import('./secrets')
  const file = join(mkdtempSync(join(tmpdir(), 'relife-key-')), 'secret.key')
  await assertKeyReady(async () => false, file)
})

test('an existing key file skips the database check', async () => {
  const { assertKeyReady } = await import('./secrets')
  const file = join(mkdtempSync(join(tmpdir(), 'relife-key-')), 'secret.key')
  writeFileSync(file, 'x')
  await assertKeyReady(async () => { throw new Error('should not query') }, file)
})
