import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Ratchet: text sizes come from the type scale in globals.css (`text-body`, `text-title`, ...), not from
// `text-[13px]`. The count may only go down. When you convert some, lower MAX_ARBITRARY_TEXT_SIZES to the
// new count; never raise it. Vendored code (src/ui/beui) and EvilCharts are not counted.
const MAX_ARBITRARY_TEXT_SIZES = 515

// Files fully on the scale. They must stay at zero.
// The shell (sidebar, top bar, tab bar and their status pieces) is fully on the scale.
const SHELL = ['sidebar', 'top-bar', 'tab-bar', 'sync-dot', 'coach-bell', 'avatar-ring', 'shell-status'].map((f) => `src/ui/components/shell/${f}.tsx`)
// Capture (phase 4) is fully on the scale too.
const CAPTURE = ['capture.tsx', 'capture-view.tsx', 'capture-gallery.tsx'].map((f) => `src/ui/components/capture/${f}`)
// Peek (phase 5) is fully on the scale too: every file under peek/ is checked below.
const PEEK = ['peek-context', 'peek-parts', 'peek-host', 'peek-view', 'peek-gallery', 'views/metric', 'views/routine', 'views/goal', 'views/money', 'views/insight', 'views/connector', 'views/people', 'views/status'].map((f) => `src/ui/components/peek/${f}.tsx`)
// Coach (phase 7) is fully on the scale: every file under coach/ and the three Coach pages.
const COACH = ['answer-card', 'ask-thread', 'cleared-today', 'coach-gallery', 'coach-panes', 'coach-tabs', 'connect-coach', 'needs-you-list', 'needs-you-panel', 'needs-you-row', 'queue-item', 'recovery-choices'].map((f) => `src/ui/components/coach/${f}.tsx`)
const COACH_PAGES = ['page', 'layout', 'patterns/page', 'history/page'].map((f) => `src/app/coach/${f}.tsx`)
// Today (phase 8): the header, attention strip, pulse, money, setup and day-end cards, the page and the pace card.
const TODAY = ['today-header', 'attention-strip', 'pulse-row', 'money-today', 'setup-card', 'day-complete', 'tomorrow-card', 'today-gallery', 'capture-button'].map((f) => `src/ui/components/today/${f}.tsx`)
const TODAY_MORE = ['src/app/page.tsx', 'src/ui/components/goals/goals-card.tsx', 'src/ui/components/goals/goals-summary.tsx']
// Setup (phase 10): the four steps, their shared parts, the save-file preview and its gallery.
const SETUP = ['onboarding-flow', 'onboarding-steps', 'onboarding-ui', 'onboarding-preview', 'onboarding-gallery'].map((f) => `src/ui/components/${f}.tsx`)
const CLEAN: string[] = ['src/ui/components/sheet.tsx', 'src/ui/components/segment-tabs.tsx', 'src/ui/components/peek/peek-link.tsx', ...SHELL, ...CAPTURE, ...PEEK, ...COACH, ...COACH_PAGES, ...TODAY, ...TODAY_MORE, ...SETUP, 'src/app/welcome/page.tsx']

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
