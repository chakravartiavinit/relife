import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { PACK_MAX_BYTES, parsePack, type Pack } from './packs'

// community/packs: packs other people share. Every file has to parse, match the index and keep the review rules in
// docs/TEMPLATES.md, so a pack that is merged is one the preview can show without surprises.

const dir = join(fileURLToPath(new URL('.', import.meta.url)), '../../../community/packs')
const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json')
const read = (f: string) => readFileSync(join(dir, f), 'utf8')
const index = JSON.parse(read('index.json')) as { id: string; name: string; description: string; author?: string; areas: string[] }[]

/** Every piece of text a pack shows a person. */
function texts(p: Pack) {
  return [p.name, p.description, p.author, p.homepage === undefined ? undefined : '', ...p.routines.flatMap((r) => [r.name, r.note, r.dose]), ...p.trackers.flatMap((t) => [t.name, t.unit]),
    ...p.goals.flatMap((g) => [g.title, g.reason, 'checkIn' in g.measure ? g.measure.checkIn : undefined, 'checkIn' in g.measure ? g.measure.unit : undefined])].filter((t): t is string => !!t)
}

test('every community pack is a valid relifePack within the size limit, and its id is its file name', () => {
  assert.ok(files.length >= 1)
  for (const f of files) {
    const text = read(f)
    assert.ok(Buffer.byteLength(text) <= PACK_MAX_BYTES, f)
    const r = parsePack(text)
    assert.ok(r.ok, `${f}: ${r.ok ? '' : r.error}`)
    assert.equal(f, `${r.pack.id}.json`)
  }
})

test('the index lists exactly the pack files, with the same name, description, author and areas', () => {
  assert.deepEqual(index.map((e) => e.id).sort(), files.map((f) => f.replace(/\.json$/, '')).sort())
  for (const e of index) {
    const p = parsePack(read(`${e.id}.json`))
    assert.ok(p.ok)
    if (p.ok) assert.deepEqual({ name: e.name, description: e.description, author: e.author, areas: e.areas }, { name: p.pack.name, description: p.pack.description, author: p.pack.author, areas: p.pack.areas })
  }
})

test('review rules: no links in text, no amounts of money, a medicine says only "as prescribed"', () => {
  for (const f of files) {
    const r = parsePack(read(f))
    assert.ok(r.ok)
    if (!r.ok) continue
    assert.equal(r.pack.homepage, undefined, `${f}: a homepage is a link`)
    for (const t of texts(r.pack)) {
      assert.ok(!/https?:|www\.|\.com\b|@\w/i.test(t), `${f}: a link or address in "${t}"`)
      assert.ok(!/[₹$€£¥]|\b(inr|usd|eur|rs\.?)\s*\d|\d\s*(inr|usd|eur)\b/i.test(t), `${f}: an amount of money in "${t}"`)
    }
    for (const x of r.pack.routines) if (x.kind === 'medicine') assert.ok(!x.dose || /^as prescribed$/i.test(x.dose), `${f}: ${x.name} dose`)
    assert.equal(r.pack.targets, undefined, `${f}: targets belong to setup, not a shared pack`)
  }
})
