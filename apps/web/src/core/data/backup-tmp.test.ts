import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { removeOldRestoreDirs, removeStale } from './backup-tmp'

function folder() {
  const dir = mkdtempSync(join(tmpdir(), 'relife-tmp-'))
  mkdirSync(join(dir, '.tmp-abc', 'data'), { recursive: true })
  writeFileSync(join(dir, '.tmp-abc', 'db.dump'), 'x')
  writeFileSync(join(dir, 'relife-backup-2026-11-13T033005.tar.gz.partial'), 'x')
  writeFileSync(join(dir, 'relife-backup-2026-11-13T033005.tar.gz'), 'x')
  mkdirSync(join(dir, '.restore-old'))
  mkdirSync(join(dir, '.restore-new'))
  const old = new Date(Date.now() - 4 * 3_600_000)
  utimesSync(join(dir, '.restore-old'), old, old)
  return dir
}

test('stale .tmp-* and .partial are removed, finished backups stay', async () => {
  const dir = folder()
  try {
    assert.deepEqual((await removeStale(dir)).sort(), ['.tmp-abc', 'relife-backup-2026-11-13T033005.tar.gz.partial'])
    assert.deepEqual(readdirSync(dir).sort(), ['.restore-new', '.restore-old', 'relife-backup-2026-11-13T033005.tar.gz'])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('only .restore-* folders older than a few hours are removed', async () => {
  const dir = folder()
  try {
    assert.deepEqual(await removeOldRestoreDirs(dir), ['.restore-old'])
    assert.ok(readdirSync(dir).includes('.restore-new'))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
