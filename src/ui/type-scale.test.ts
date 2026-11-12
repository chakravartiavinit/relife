import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Ratchet: text sizes come from the type scale in globals.css (`text-body`, `text-title`, ...), not from
// `text-[13px]`. The count may only go down. When you convert some, lower MAX_ARBITRARY_TEXT_SIZES to the
// new count; never raise it. Vendored code (src/ui/beui) and EvilCharts are not counted.
const MAX_ARBITRARY_TEXT_SIZES = 700

// Files fully on the scale. They must stay at zero.
// The shell (sidebar, top bar, tab bar and their status pieces) is fully on the scale.
const SHELL = ['sidebar', 'top-bar', 'tab-bar', 'sync-dot', 'coach-bell', 'avatar-ring', 'shell-status'].map((f) => `src/ui/components/shell/${f}.tsx`)
// Capture (phase 4) is fully on the scale too.
const CAPTURE = ['capture.tsx', 'capture-view.tsx', 'capture-gallery.tsx'].map((f) => `src/ui/components/capture/${f}`)
// Peek (phase 5) is fully on the scale too: every file under peek/ is checked below.
const PEEK = ['peek-context', 'peek-parts', 'peek-host', 'peek-view', 'peek-gallery', 'views/metric', 'views/routine', 'views/goal', 'views/money', 'views/insight', 'views/connector', 'views/people', 'views/status'].map((f) => `src/ui/components/peek/${f}.tsx`)
const CLEAN: string[] = ['src/ui/components/sheet.tsx', 'src/ui/components/segment-tabs.tsx', 'src/ui/components/peek/peek-link.tsx', ...SHELL, ...CAPTURE, ...PEEK]

const PATTERN = /text-\[\d+(?:\.\d+)?px\]/g
const SKIP = new Set(['beui', 'node_modules', 'evilcharts'])

function* files(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) yield* files(p)
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) yield p
  }
}

const counts = new Map<string, number>()
for (const root of ['src/app', 'src/ui'])
  for (const f of files(root)) {
    const n = readFileSync(f, 'utf8').match(PATTERN)?.length ?? 0
    if (n) counts.set(f, n)
  }

test('arbitrary text sizes only go down', () => {
  const total = [...counts.values()].reduce((a, b) => a + b, 0)
  assert.ok(total <= MAX_ARBITRARY_TEXT_SIZES, `${total} text-[Npx] classes, the limit is ${MAX_ARBITRARY_TEXT_SIZES}. Use the type scale (text-body, text-small, text-caption, text-label...).`)
  if (total < MAX_ARBITRARY_TEXT_SIZES) console.log(`type-scale: ${total} left, lower MAX_ARBITRARY_TEXT_SIZES from ${MAX_ARBITRARY_TEXT_SIZES}`)
})

test('files on the type scale stay clean', () => {
  for (const f of CLEAN) assert.equal(counts.get(f) ?? 0, 0, `${f} must not use text-[Npx]`)
})
