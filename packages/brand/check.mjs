// Guards the rename: the product's display name should come from brand.json, not be retyped in code.
//   node packages/brand/check.mjs            fails when a file has more display-name hits than name-baseline.json allows
//   node packages/brand/check.mjs --update   rewrites the baseline (use after moving strings to brand.json)
//   node packages/brand/check.mjs --public   fails while brand.json has publicReady: false (the site build runs this)
// The baseline is a ratchet: hits that exist today are listed, new ones fail. Rename day = the baseline goes to {}.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { swiftIsFresh } from './swift.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../..')
const brand = JSON.parse(readFileSync(resolve(here, 'brand.json'), 'utf8'))
const baselinePath = resolve(here, 'name-baseline.json')

if (process.argv.includes('--public')) {
  if (!brand.publicReady) {
    console.error('brand: publicReady is false. The current name and logo are a fan tribute; set an original brand in packages/brand/brand.json before a public launch.')
    process.exit(1)
  }
  console.log('brand: publicReady')
  process.exit(0)
}

// The generated Swift file must match brand.json (like `tokens --check`).
if (!swiftIsFresh()) {
  console.error('brand: apps/mac/Sources/ReLifeKit/Brand.swift is out of date (run `npm run brand:swift`)')
  process.exit(1)
}

// Developer docs may name the product; code, UI strings, the extension and scripts may not (except through brand.json).
const SCANNED = /\.(ts|tsx|js|mjs|json|css|html|md|webmanifest|sh|swift|plist)$/
const EXEMPT = /^(packages\/brand\/|packages\/contract\/fixtures\/|apps\/mac\/Sources\/ReLifeKit\/Brand\.swift$|docs\/|plans\/|\.claude\/|\.agents\/|\.githooks\/|README\.md$|AGENTS\.md$|CLAUDE\.md$|LICENSE$|package-lock\.json$|skills-lock\.json$)|(^|\/)(AGENTS|CLAUDE)\.md$/
const pattern = new RegExp(`\\b(${brand.legacyNames.join('|')})\\b`, 'g')

const files = execFileSync('git', ['ls-files', '-z'], { cwd: repo, encoding: 'utf8' }).split('\0').filter((f) => f && SCANNED.test(f) && !EXEMPT.test(f))
const counts = {}
const lines = {}
for (const f of files) {
  let text
  try { text = readFileSync(resolve(repo, f), 'utf8') } catch { continue }
  text.split('\n').forEach((line, i) => {
    if (!pattern.test(line)) return
    pattern.lastIndex = 0
    counts[f] = (counts[f] ?? 0) + 1
    ;(lines[f] ??= []).push(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`)
  })
}

if (process.argv.includes('--update')) {
  writeFileSync(baselinePath, JSON.stringify(Object.fromEntries(Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : 1))), null, 2) + '\n')
  console.log(`brand: baseline written (${Object.keys(counts).length} files, ${Object.values(counts).reduce((a, b) => a + b, 0)} lines)`)
  process.exit(0)
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
const over = Object.keys(counts).filter((f) => counts[f] > (baseline[f] ?? 0))
if (over.length) {
  console.error(`brand: the display name is hard-coded in code outside packages/brand (${brand.legacyNames.join(', ')}). Read it from @relife/brand/brand.json instead:`)
  for (const f of over) console.error(...lines[f].slice(baseline[f] ?? 0, undefined))
  process.exit(1)
}
const shrunk = Object.keys(baseline).filter((f) => (counts[f] ?? 0) < baseline[f])
console.log(`brand: ok${shrunk.length ? ` (${shrunk.length} files use the name less than the baseline: run \`npm run brand:check -- --update\`)` : ''}`)
