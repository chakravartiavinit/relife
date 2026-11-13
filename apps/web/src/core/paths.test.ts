import assert from 'node:assert/strict'
import { test } from 'node:test'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { dataDir } from './paths'

test('data lives at the repo root, not inside apps/web', () => {
  delete process.env.RELIFE_DATA_DIR
  const dir = dataDir()
  assert.equal(basename(dir), 'data')
  assert.ok(isAbsolute(dir))
  assert.notEqual(basename(dirname(dir)), 'web')
  assert.equal(dir, resolve(import.meta.dirname, '..', '..', '..', '..', 'data'))
  assert.equal(dataDir('coins', 'index.json'), join(dir, 'coins', 'index.json'))
})

test('RELIFE_DATA_DIR moves it', () => {
  process.env.RELIFE_DATA_DIR = '/var/lib/relife'
  assert.equal(dataDir('library'), '/var/lib/relife/library')
  process.env.RELIFE_DATA_DIR = 'backup/data'
  assert.equal(dataDir(), resolve(import.meta.dirname, '..', '..', '..', '..', 'backup', 'data'))
  delete process.env.RELIFE_DATA_DIR
})
