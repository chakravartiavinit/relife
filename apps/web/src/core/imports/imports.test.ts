import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RawEvent } from '@/core/types'
import type { User } from '@/core/user'
import { emitAppleHealth, previewAppleHealth } from './apple-health'
import { parseFitCsv, previewTakeout, emitTakeout, youtubeDays } from './takeout'
import { emitStatement } from './statement'
import { emitTrackerCsv } from './tracker-csv'
import type { EmitCtx } from './kinds'
import { makeZip } from './zip-fixture'
import type { StatementMapping } from '@/domain/statement'
import type { TrackerCsvMapping } from '@/domain/tracker-csv'

// Fake data only. Zips are built in memory (stored, not compressed) and written to a temp folder.

const user = { id: 'u', name: 'Me', timezone: 'Asia/Kolkata', baseCurrency: 'INR' } as User
const dir = mkdtempSync(join(tmpdir(), 'relife-imports-'))
const write = (name: string, data: string | Buffer) => { const f = join(dir, name); writeFileSync(f, data); return f }

function ctx(mapping: EmitCtx['mapping'] = null) {
  const events: RawEvent[] = []
  const progress: string[] = []
  const c: EmitCtx = { user, importId: 'imp-1', mapping, send: async (e) => { events.push(...e) }, progress: async (p) => { progress.push(p.phase) } }
  return { c, events, progress }
}

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData [
<!ELEMENT HealthData (ExportDate,Me,(Record|Correlation|Workout|ActivitySummary)*)>
<!ATTLIST HealthData locale CDATA #REQUIRED>
<!ELEMENT Record ((MetadataEntry)*)>
]>
<HealthData locale="en_US">
 <ExportDate value="2024-01-04 10:00:00 +0530"/>
 <Me HKCharacteristicTypeIdentifierDateOfBirth=""/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Fake Phone" unit="count" creationDate="2024-01-01 09:00:00 +0530" startDate="2024-01-01 08:00:00 +0530" endDate="2024-01-01 08:30:00 +0530" value="3000"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Fake Watch" unit="count" creationDate="2024-01-01 09:00:00 +0530" startDate="2024-01-01 08:00:00 +0530" endDate="2024-01-01 08:30:00 +0530" value="3400">
  <MetadataEntry key="HKWasUserEntered" value="1"/>
 </Record>
 <Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Fake Scale" unit="kg" creationDate="2024-01-02 07:00:00 +0530" startDate="2024-01-02 07:00:00 +0530" endDate="2024-01-02 07:00:00 +0530" value="70.5"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Fake Watch" creationDate="2024-01-03 07:00:00 +0530" startDate="2024-01-02 23:00:00 +0530" endDate="2024-01-03 06:00:00 +0530" value="HKCategoryValueSleepAnalysisAsleepCore"/>
 <Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Fake Watch" unit="count/min" startDate="2024-01-03 08:00:00 +0530" endDate="2024-01-03 08:00:00 +0530" value="71"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30"/>
</HealthData>`

test('Apple Health: streams export.xml (any folder name) into one raw event per day', async () => {
  const file = write('health.zip', makeZip({ 'apple_health_export/export_cda.xml': '<x/>', 'Exportación/export.xml': XML }))
  assert.deepEqual((await previewAppleHealth(file)).ok, true)
  const { c, events, progress } = ctx()
  const r = await emitAppleHealth(file, c)
  assert.deepEqual(events.map((e) => [e.source, e.externalId]), [
    ['apple-health-export', 'day:2024-01-01'], ['apple-health-export', 'day:2024-01-02'], ['apple-health-export', 'day:2024-01-03'],
  ])
  assert.deepEqual(events[0].body, { importId: 'imp-1', date: '2024-01-01', metrics: { steps: 3400 } })
  assert.deepEqual(events[1].body, { importId: 'imp-1', date: '2024-01-02', metrics: { weight: 70.5 } })
  assert.deepEqual(events[2].body, { importId: 'imp-1', date: '2024-01-03', metrics: {}, sleepHours: 7 })
  assert.deepEqual({ rows: r.rows, invalid: r.invalid, from: r.from, to: r.to }, { rows: 3, invalid: 0, from: '2024-01-01', to: '2024-01-03' })
  assert.ok(progress.includes('Saving'))
})

test('Apple Health: a zip without export.xml says so, a non-zip too', async () => {
  const empty = write('nothing.zip', makeZip({ 'readme.txt': 'hi' }))
  const p = await previewAppleHealth(empty)
  assert.equal(p.ok, false)
  assert.match((p as { error: string }).error, /No export\.xml in this zip/)
  const bad = await previewAppleHealth(write('bad.zip', 'not a zip'))
  assert.equal(bad.ok, false)
})

const FIT = `Date,Step count,Distance (m),Move Minutes count,Heart Points,Calories (kcal)
2024-01-01,8000,6100.5,52,31,2100
2024-01-02,0,0,0,0,1800
2024-01-03,9100,,60,40,2200
`
test('Fit CSV: English headers only, days with no activity skipped', () => {
  assert.deepEqual(parseFitCsv(FIT)?.map((d) => d.date), ['2024-01-01', '2024-01-02', '2024-01-03'])
  assert.equal(parseFitCsv('Datum,Schritte\n2024-01-01,5')?.length ?? null, null)
  assert.equal(parseFitCsv('Start time,End time,Step count\n10:00,11:00,5'), null) // a per-day file has no Date column
})

test('YouTube history: videos per local day with the top channel; ads and Music skipped', () => {
  const items = [
    { header: 'YouTube', time: '2024-01-01T20:00:00.000Z', subtitles: [{ name: 'Fake Channel A' }] }, // 01:30 on Jan 2 in India
    { header: 'YouTube', time: '2024-01-02T03:00:00.000Z', subtitles: [{ name: 'Fake Channel A' }] },
    { header: 'YouTube', time: '2024-01-02T04:00:00.000Z', subtitles: [{ name: 'Fake Channel B' }] },
    { header: 'YouTube', time: '2024-01-02T05:00:00.000Z', details: [{ name: 'From Google Ads' }], subtitles: [{ name: 'Fake Ad' }] },
    { header: 'YouTube Music', time: '2024-01-02T06:00:00.000Z', subtitles: [{ name: 'Fake Band' }] },
  ]
  assert.deepEqual([...youtubeDays(items, 'Asia/Kolkata')], [['2024-01-02', { videos: 3, topChannel: 'Fake Channel A' }]])
})

test('Takeout: Fit and YouTube become day events; HTML-only YouTube history asks for JSON', async () => {
  const yt = JSON.stringify([{ header: 'YouTube', time: '2024-01-02T03:00:00.000Z', subtitles: [{ name: 'Fake Channel A' }] }])
  const file = write('takeout.zip', makeZip({
    'Takeout/Fit/Daily activity metrics/Daily activity metrics.csv': FIT,
    'Takeout/YouTube and YouTube Music/history/watch-history.json': yt,
    'Takeout/Location History/Records.json': '{}',
  }))
  const p = await previewTakeout(file)
  assert.equal(p.ok && p.from, '2024-01-01')
  const { c, events } = ctx()
  const r = await emitTakeout(file, c)
  assert.deepEqual(events.map((e) => e.source + ' ' + e.externalId), ['google-fit-export day:2024-01-01', 'google-fit-export day:2024-01-03', 'youtube-history day:2024-01-02'])
  assert.deepEqual(events[0].body, { importId: 'imp-1', date: '2024-01-01', steps: 8000, distanceM: 6100.5, moveMinutes: 52, heartPoints: 31 })
  assert.equal(r.rows, 4 + 3 + 1)
  const html = write('html.zip', makeZip({ 'Takeout/YouTube/history/watch-history.html': '<html/>' }))
  assert.match((await previewTakeout(html) as { error: string }).error, /JSON/)
  const none = write('none.zip', makeZip({ 'Takeout/Mail/All.mbox': '' }))
  assert.match((await previewTakeout(none) as { error: string }).error, /No Fit or YouTube files found/)
})

const STATEMENT = `Sample Bank,Account statement
Date,Narration,Debit,Credit,Balance
05/01/2024,UPI/412345678901/FAKE CAFE,120.00,,880.00
05/01/2024,UPI/412345678901/FAKE CAFE,120.00,,760.00
06/01/2024,,not a number,,
07/01/2024,SALARY FAKE EMPLOYER,,5000.00,5760.00
`
const stmt: StatementMapping = {
  kind: 'statement', headerRow: 1, delimiter: ',', decimal: '.', dateFormat: 'DD/MM/YYYY',
  columns: { date: 0, description: 1, debit: 2, credit: 3, balance: 4 }, invert: false, currency: 'INR', account: { name: 'Sample Bank', kind: 'bank' },
}

test('statement emit: stable ids, an identical row stays a second row, invalid rows counted with a reason', async () => {
  const file = write('s.csv', STATEMENT)
  const a = ctx(stmt), b = ctx(stmt)
  const r = await emitStatement(file, a.c)
  await emitStatement(file, b.c)
  assert.equal(a.events.length, 3)
  assert.deepEqual(a.events.map((e) => e.externalId), b.events.map((e) => e.externalId))
  assert.equal(new Set(a.events.map((e) => e.externalId)).size, 3)
  assert.ok(a.events[0].externalId.startsWith('statement:sample-bank:'))
  assert.deepEqual({ rows: r.rows, invalid: r.invalid, invalidSamples: r.invalidSamples, from: r.from, to: r.to }, { rows: 3, invalid: 1, invalidSamples: ['row 5: no amount'], from: '2024-01-05', to: '2024-01-07' })
  assert.equal((a.events[0].body as { amount: number }).amount, -120)
  assert.equal(a.events[0].at.toISOString(), '2024-01-05T06:30:00.000Z') // local noon in India
})

test('tracker CSV emit: wide shape, yes/no values, one event per day and metric', async () => {
  const file = write('t.csv', 'Date,Pages read,Meditated\n2024-01-01,12,yes\n2024-01-02,0,no\n2024-01-03,,\n')
  const m: TrackerCsvMapping = {
    kind: 'tracker-csv', headerRow: 0, delimiter: ',', decimal: '.', dateFormat: 'YYYY-MM-DD', shape: 'wide', columns: { date: 0 },
    metrics: { 'Pages read': { slug: 'pages-read', unit: 'pages' }, Meditated: { slug: 'meditated' } },
  }
  const { c, events } = ctx(m)
  const r = await emitTrackerCsv(file, c)
  assert.deepEqual(events.map((e) => e.externalId), ['day:2024-01-01:pages-read', 'day:2024-01-01:meditated', 'day:2024-01-02:pages-read', 'day:2024-01-02:meditated'])
  assert.equal((events[1].body as { value: number }).value, 1)
  assert.deepEqual({ rows: r.rows, invalid: r.invalid }, { rows: 4, invalid: 1 })
})
