import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkUnpacked } from './restore'

function unpacked(setup: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'relife-unpacked-'))
  mkdirSync(join(dir, 'data', 'library', 'covers'), { recursive: true })
  writeFileSync(join(dir, 'data', 'secret.key'), 'k')
  writeFileSync(join(dir, 'data', 'library', 'covers', 'a.jpg'), 'x')
  setup(dir)
  return dir
}

test('plain files and folders pass', async () => {
  const dir = unpacked(() => {})
  try { await checkUnpacked(dir) } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('a missing key or library is fine', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'relife-unpacked-'))
  try { await checkUnpacked(dir) } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('a symlinked secret.key is refused', async () => {
  const dir = unpacked((d) => { rmSync(join(d, 'data', 'secret.key')); symlinkSync('/etc/passwd', join(d, 'data', 'secret.key')) })
  try { await assert.rejects(checkUnpacked(dir), /secret\.key/) } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('a symlinked vapid.json is refused', async () => {
  const dir = unpacked((d) => symlinkSync('/etc/passwd', join(d, 'data', 'vapid.json')))
  try { await assert.rejects(checkUnpacked(dir), /vapid\.json/) } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('a symlink anywhere in library is refused', async () => {
  const dir = unpacked((d) => symlinkSync('/etc', join(d, 'data', 'library', 'covers', 'evil')))
  try { await assert.rejects(checkUnpacked(dir), /covers\/evil/) } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('library itself as a symlink is refused', async () => {
  const dir = unpacked((d) => { rmSync(join(d, 'data', 'library'), { recursive: true }); symlinkSync('/etc', join(d, 'data', 'library')) })
  try { await assert.rejects(checkUnpacked(dir), /library/) } finally { rmSync(dir, { recursive: true, force: true }) }
})
