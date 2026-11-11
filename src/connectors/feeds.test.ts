import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ConnectorCtx, RawEvent } from '@/core/types'
import { letterboxd, letterboxdDays, letterboxdUser, letterboxdWatches } from './letterboxd'
import { openLibraryDays, openLibraryUser } from './openlibrary'
import { anki, ankiDays } from './anki'

const TZ = 'Asia/Kolkata'

const item = (guid: string, body: string) => `<item> <title>x</title> <guid isPermaLink="false">${guid}</guid> ${body} </item>`
const watch = (date: string, title: string, rating?: string, year = '2026') =>
  item(`letterboxd-watch-${title}`, `<letterboxd:watchedDate>${date}</letterboxd:watchedDate> <letterboxd:rewatch>No</letterboxd:rewatch> <letterboxd:filmTitle>${title}</letterboxd:filmTitle> <letterboxd:filmYear>${year}</letterboxd:filmYear>${rating ? ` <letterboxd:memberRating>${rating}</letterboxd:memberRating>` : ''}`)

test('letterboxdWatches reads diary entries and skips lists and entries without a watched date', () => {
  const xml = `<rss><channel><title>Letterboxd - Dave</title>
    ${watch('2026-11-10', 'Coward', '4.0')}
    ${item('letterboxd-list-1', '<description><![CDATA[ <p>A list</p> ]]></description>')}
    ${item('letterboxd-watch-2', '<letterboxd:filmTitle>No date</letterboxd:filmTitle>')}
    ${watch('2026-11-09', 'Tom &amp; Jerry', undefined, '2021')}
  </channel></rss>`
  assert.deepEqual(letterboxdWatches(xml), [
    { date: '2026-11-10', title: 'Coward', year: '2026', rating: 4 },
    { date: '2026-11-09', title: 'Tom & Jerry', year: '2021', rating: undefined },
  ])
})

test('letterboxdDays counts films per day with titles and the average rating', () => {
  const days = letterboxdDays([
    { date: '2026-11-06', title: 'A', year: '2026', rating: 4 },
    { date: '2026-11-06', title: 'B', rating: 3.5 },
    { date: '2026-11-06', title: 'C' },
    { date: '2026-11-07', title: 'D', year: '2020' },
  ])
  assert.deepEqual(days, [
    { date: '2026-11-06', films: 3, titles: ['A (2026)', 'B', 'C'], rating: 3.8 },
    { date: '2026-11-07', films: 1, titles: ['D (2020)'], rating: undefined },
  ])
})

test('letterboxdUser accepts a name or a profile link and rejects anything else', () => {
  assert.equal(letterboxdUser(' dave '), 'dave')
  assert.equal(letterboxdUser('https://letterboxd.com/dave/'), 'dave')
  assert.equal(letterboxdUser('letterboxd.com/dave/films/'), 'dave')
  assert.throws(() => letterboxdUser('not a name!'), /not a Letterboxd username/)
})

test('openLibraryDays puts a book on the local day it was marked read (logged in UTC)', () => {
  const days = openLibraryDays([
    { work: { title: 'Atomic Habits' }, logged_date: '2025/09/23, 20:30:00' }, // 02:00 on the 24th in India
    { work: { title: 'Hold Me Tight' }, logged_date: '2025/09/24, 02:11:08' },
    { work: { title: 'Broken' }, logged_date: 'yesterday' },
    { logged_date: '2025/09/25, 05:00:00' },
  ], TZ)
  assert.deepEqual(days, [
    { date: '2025-09-24', books: 2, titles: ['Atomic Habits', 'Hold Me Tight'] },
    { date: '2025-09-25', books: 1, titles: [] },
  ])
  assert.equal(openLibraryUser('https://openlibrary.org/people/mekBot/books'), 'mekBot')
  assert.throws(() => openLibraryUser('a b'), /not an Open Library username/)
})

test('ankiDays joins card counts with minutes from review rows and skips hand-rescheduled rows', () => {
  const at = (iso: string) => Date.parse(iso)
  const days = ankiDays(
    [['2026-11-08', 40], ['2026-11-07', 25], ['2026-10-01', 9]],
    [
      [at('2026-11-08T05:00:00Z'), 1, -1, 3, 4, -60, 2500, 6000, 0],
      [at('2026-11-08T05:01:00Z'), 2, -1, 3, 4, -60, 2500, 54_000, 1],
      [at('2026-11-08T05:02:00Z'), 3, -1, 0, 0, 0, 0, 600_000, 4], // rescheduled by hand: not study
    ],
    TZ, '2026-11-01',
  )
  assert.deepEqual(days, [{ date: '2026-11-08', cards: 40, minutes: 1 }, { date: '2026-11-07', cards: 25, minutes: undefined }])
})

const ctx = (events: RawEvent[]) => ({
  user: { timezone: TZ }, cursor: null, setCursor() {}, log() {}, emit: async (e: RawEvent) => void events.push(e),
}) as unknown as ConnectorCtx

test('anki says to open Anki when AnkiConnect is not reachable', async () => {
  const real = globalThis.fetch
  globalThis.fetch = (async () => { throw new TypeError('fetch failed') }) as typeof fetch
  try {
    await assert.rejects(() => anki.sync(ctx([])), /Open Anki with the AnkiConnect add-on/)
  } finally { globalThis.fetch = real }
})

test('anki reads an AnkiConnect reply in its documented format', async () => {
  const real = globalThis.fetch
  const now = Date.now()
  const today = new Date(now).toLocaleDateString('en-CA', { timeZone: TZ })
  const asked: { action: string; params: Record<string, unknown> }[] = []
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const { action, params, version } = JSON.parse(String(init.body))
    assert.equal(version, 6)
    asked.push({ action, params })
    const result = action === 'getNumCardsReviewedByDay' ? [[today, 30]]
      : action === 'deckNames' ? ['Default', 'Spanish::Verbs']
      : params.deck === 'Spanish::Verbs' ? [[now - 60_000, 1, -1, 3, 4, -60, 2500, 12_000, 1], [now - 30_000, 2, -1, 3, 4, -60, 2500, 18_000, 1]] : []
    return new Response(JSON.stringify({ result, error: null }))
  }) as typeof fetch
  try {
    const events: RawEvent[] = []
    await anki.sync(ctx(events))
    assert.equal(events.at(-1)?.source, 'anki')
    assert.deepEqual(events.at(-1)?.body, { date: today, cards: 30, minutes: 1 }) // 30 s rounds to 1 min
    assert.deepEqual(asked.filter((a) => a.action === 'cardReviews').map((a) => a.params.deck), ['Default', 'Spanish::Verbs'])
  } finally { globalThis.fetch = real }
})

test('anki explains a rejected key and a wrong address', async () => {
  const real = globalThis.fetch
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({ result: null, error: 'valid api key must be provided' }))) as typeof fetch
    await assert.rejects(() => anki.sync(ctx([])), /rejected the key/)
    globalThis.fetch = (async () => new Response('<html>hi</html>')) as typeof fetch
    await assert.rejects(() => anki.sync(ctx([])), /is not AnkiConnect/)
  } finally { globalThis.fetch = real }
})

test('letterboxd drops the oldest day of a full feed and fills quiet days with zero', async () => {
  const real = globalThis.fetch
  const dates = Array.from({ length: 50 }, (_, i) => new Date(Date.UTC(2026, 10, 10) - (i % 10) * 86_400_000).toISOString().slice(0, 10))
  const xml = `<rss>${dates.map((d, i) => watch(d, `Film ${i}`)).join('')}</rss>`
  globalThis.fetch = (async () => new Response(xml)) as typeof fetch
  process.env.LETTERBOXD_USERNAME = 'dave'
  try {
    const events: RawEvent[] = []
    await letterboxd.sync(ctx(events))
    const days = events.map((e) => (e.body as { date: string }).date)
    assert.ok(!days.includes('2026-11-01'), 'the oldest day of a full feed may be cut off')
    assert.ok(days.includes('2026-11-02') && days.includes('2026-11-10'))
  } finally { globalThis.fetch = real; delete process.env.LETTERBOXD_USERNAME }
})

test('letterboxd says when the user is not found', async () => {
  const real = globalThis.fetch
  globalThis.fetch = (async () => new Response('', { status: 404 })) as typeof fetch
  process.env.LETTERBOXD_USERNAME = 'nobody'
  try { await assert.rejects(() => letterboxd.sync(ctx([])), /user not found/) } finally { globalThis.fetch = real; delete process.env.LETTERBOXD_USERNAME }
})
