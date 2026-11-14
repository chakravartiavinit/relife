import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

// .githooks/pre-commit run in a scratch repo with one staged file: which paths does it block?
const hook = resolve(process.cwd(), '../../.githooks/pre-commit')

// Run from a git hook (pre-push), the environment carries GIT_DIR and friends: without this the scratch repo would be the real one.
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')))

function blocked(path: string): boolean {
  const dir = mkdtempSync(join(tmpdir(), 'relife-hook-'))
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir, env })
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), 'x\n')
    execFileSync('git', ['add', '-f', path], { cwd: dir, env })
    return spawnSync('sh', [hook], { cwd: dir, env, encoding: 'utf8' }).status !== 0
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

test('the apps data folder is blocked', () => {
  assert.ok(blocked('apps/web/data/secret.key'))
  assert.ok(blocked('apps/web/data/library/cover.jpg'))
  assert.ok(blocked('data/secret.key'))
})

test('the apps data rule does not hide the later rules', () => {
  for (const p of [
    'apps/web/src/core/data/leak.key',
    'apps/web/src/core/data/db.dump',
    'apps/web/src/core/data/relife-export-1.zip',
    'apps/web/node_modules/x/data/y.js',
  ]) assert.ok(blocked(p), p)
})

test('code under a data folder passes', () => {
  assert.equal(blocked('apps/web/src/core/data/tables.ts'), false)
})
