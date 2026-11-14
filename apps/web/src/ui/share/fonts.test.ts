import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { CARD_CHARS } from '@/domain/share-card'

// `CARD_CHARS` is the set of characters a card may draw. Every one must have a glyph in every vendored font, or Satori
// would go looking for a fallback font over the network.

/** The code points of a TrueType font's cmap (formats 4 and 12), enough for the vendored subsets. */
function cmapChars(buf: Buffer) {
  const u16 = (o: number) => buf.readUInt16BE(o), u32 = (o: number) => buf.readUInt32BE(o)
  let cmap = -1
  for (let i = 0; i < u16(4); i++) { const o = 12 + i * 16; if (buf.toString('latin1', o, o + 4) === 'cmap') cmap = u32(o + 8) }
  assert.ok(cmap >= 0, 'font has a cmap')
  const out = new Set<number>()
  for (let i = 0; i < u16(cmap + 2); i++) {
    const pid = u16(cmap + 4 + i * 8), eid = u16(cmap + 6 + i * 8), off = cmap + u32(cmap + 8 + i * 8)
    if (!((pid === 3 && (eid === 1 || eid === 10)) || pid === 0)) continue
    const fmt = u16(off)
    if (fmt === 4) {
      const segs = u16(off + 6) / 2, end = off + 14, start = end + segs * 2 + 2, delta = start + segs * 2, range = delta + segs * 2
      for (let s = 0; s < segs; s++) {
        const e = u16(end + s * 2), st = u16(start + s * 2), d = u16(delta + s * 2), ro = u16(range + s * 2)
        for (let c = st; c <= e && c !== 0xffff; c++) {
          let g = ro === 0 ? (c + d) & 0xffff : u16(range + s * 2 + ro + (c - st) * 2)
          if (ro !== 0 && g !== 0) g = (g + d) & 0xffff
          if (g !== 0) out.add(c)
        }
      }
    } else if (fmt === 12) {
      for (let g = 0; g < u32(off + 12); g++) { const o = off + 16 + g * 12; for (let c = u32(o); c <= u32(o + 4); c++) out.add(c) }
    }
  }
  return out
}

const dir = join(process.cwd(), 'assets/og/fonts')
const fonts = ['Inter-Regular.ttf', 'Inter-SemiBold.ttf', 'Outfit-ExtraBold.ttf', 'JetBrainsMono-SemiBold.ttf']

test('every character a card may draw has a glyph in every vendored card font', () => {
  const allowed: number[] = []
  for (let c = 0; c <= 0x2193 + 0x100; c++) if (CARD_CHARS.test(String.fromCodePoint(c))) allowed.push(c)
  assert.ok(allowed.length > 200)
  for (const f of fonts) {
    const have = cmapChars(readFileSync(join(dir, f)))
    const missing = allowed.filter((c) => !have.has(c)).map((c) => `U+${c.toString(16)}`)
    assert.deepEqual(missing, [], f)
  }
})

test('the characters the card layout writes itself are all allowed', () => {
  for (const file of ['src/ui/share/card.tsx', 'src/domain/share-card.ts']) {
    const text = readFileSync(join(process.cwd(), file), 'utf8').replace(/CARD_CHARS = .*/, '')
    const odd = [...new Set([...text].filter((c) => c.codePointAt(0)! > 0x7e && !CARD_CHARS.test(c)))]
    // Comments may use any text; what matters is the strings that reach `cardText`, so only flag characters in code lines.
    const code = text.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
    assert.deepEqual(odd.filter((c) => code.includes(c)), [], file)
  }
})
