import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AI_USES, matchesUse } from './uses'

// Ratchet: every generate(task, label, …) call in the app has an entry in AI_USES, which the privacy page shows.
const SKIP = new Set(['node_modules'])
function sources(dir: string, out: string[] = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) sources(p, out)
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

const files = sources('src').map((f) => [f, readFileSync(f, 'utf8')] as const)
/** `generate('plan', 'label'`, or a template label like `parse.orders.${platform}`. */
const CALL = /\bgenerate(?:<[^>]*>)?\(\s*'(parse|plan|chat)',\s*(['`])([^'`]+)\2/g
// Calls whose label is a variable. Each one is allowed only where the labels it can take are all in AI_USES.
const VARIABLE_LABEL = new Map([['src/core/system.ts', 1]])

test('every generate() label has an AI_USES entry', () => {
  const found: { file: string; task: string; label: string }[] = []
  for (const [file, text] of files) for (const m of text.matchAll(CALL)) found.push({ file, task: m[1], label: m[3] })
  assert.ok(found.length >= 8, 'the scan should find the app’s calls')
  for (const { file, task, label } of found) {
    // `parse.orders.${platform}` is tested as `parse.orders.x`.
    const probe = label.replace(/\$\{[^}]*\}/g, 'x')
    const use = AI_USES.find((u) => matchesUse(u, probe))
    assert.ok(use, `${file}: generate('${task}', '${label}') has no entry in src/ai/uses.ts`)
    assert.equal(use.task, task, `${label} is task ${task} in ${file} but ${use.task} in AI_USES`)
  }
})

test('calls with a variable label are the known ones', () => {
  const variable = new Map<string, number>()
  for (const [file, text] of files) {
    if (file.endsWith('src/ai/run.ts')) continue // the definition
    const n = [...text.matchAll(/\bgenerate(?:<[^>]*>)?\(\s*'(?:parse|plan|chat)',\s*[A-Za-z_]/g)].length
    if (n) variable.set(file, n)
  }
  assert.deepEqual([...variable], [...VARIABLE_LABEL])
  // system.ts passes `label`, which is one of these two:
  for (const label of ['system.daily-quests', 'system.emergency-quest']) assert.ok(AI_USES.some((u) => matchesUse(u, label)), label)
})

test('no entry is left over for a call that was removed', () => {
  const all = files.map(([, t]) => t).join('\n')
  for (const u of AI_USES) {
    if (typeof u.label === 'string') assert.ok(all.includes(`'${u.label}'`), `${u.label} is in AI_USES but no code uses it`)
    else assert.ok(new RegExp(u.label.source.replace(/^\^/, '').replace(/\\\./g, '\\.')).test(all), `${u.label} is in AI_USES but no code uses it`)
  }
})
