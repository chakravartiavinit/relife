import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SHARE_FIELDS, SHARE_KINDS, SHARE_SIZES, type ShareData } from '@/domain/share-card'
import { renderShareCard } from './render'

// A card is made on this machine. Satori reaches for the network when it meets a glyph its fonts lack (Google Fonts, with
// the text in the address; twemoji from a CDN), so the renderer never lets that happen. This stubs `fetch` and every
// other way out, and draws cards with the awkward names.

const png = (b: Buffer) => ({ ok: b.subarray(1, 4).toString() === 'PNG', width: b.readUInt32BE(16), height: b.readUInt32BE(20) })

test('rendering never touches the network, even for a name with Devanagari, a flag and a star', async () => {
  const real = globalThis.fetch
  const calls: string[] = []
  globalThis.fetch = (async (input: unknown) => { calls.push(String(input)); throw new Error('network is off') }) as typeof fetch
  try {
    const name = 'राहुल 🇮🇳 ★ 👍🏽'
    const base = { name }
    const data: Record<string, ShareData> = {
      level: { ...base, kind: 'level', level: 4, title: 'Rookie ★', totalXp: 2400, areas: [{ label: 'Health', level: 3 }] },
      streak: { ...base, kind: 'streak', days: 7, best: 12, freezesUsed: 1 },
      achievement: { ...base, kind: 'achievement', title: 'First week ✓ 🎉', tier: 'gold', date: '2026-11-10' },
      weekly: { ...base, kind: 'weekly', weekStart: '2026-11-09', daysShown: 5, xp: 1284, questsCleared: 2, topArea: 'Health', routines: { done: 4, total: 6 }, goals: { onPace: 1, total: 2 }, stepsAvg: 8000, sleepAvgHours: 7.2, spend: 'less' },
    }
    for (const kind of SHARE_KINDS) {
      for (const size of ['square', 'story'] as const) {
        const res = await renderShareCard({ data: data[kind], show: SHARE_FIELDS[kind].map((f) => f.id), theme: 'dark', size })
        assert.equal(res.headers.get('content-type'), 'image/png')
        assert.deepEqual(png(Buffer.from(await res.arrayBuffer())), { ok: true, ...SHARE_SIZES[size] }, `${kind} ${size}`)
      }
    }
    assert.deepEqual(calls, [])
  } finally {
    globalThis.fetch = real
  }
})
