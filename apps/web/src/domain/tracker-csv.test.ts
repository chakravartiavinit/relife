import { test } from 'node:test'
import assert from 'node:assert/strict'
import { guessTrackerMapping, parseTrackerValue, readTrackerRow, type TrackerCsvMapping } from './tracker-csv'

test('parseTrackerValue: numbers, decimal commas and yes/no', () => {
  assert.equal(parseTrackerValue('12', '.'), 12)
  assert.equal(parseTrackerValue('12.5', '.'), 12.5)
  assert.equal(parseTrackerValue('12,5', ','), 12.5)
  assert.equal(parseTrackerValue('Yes', '.'), 1)
  assert.equal(parseTrackerValue('no', '.'), 0)
  assert.equal(parseTrackerValue('TRUE', '.'), 1)
  assert.equal(parseTrackerValue('', '.'), null)
  assert.equal(parseTrackerValue('later', '.'), null)
})

test('guessTrackerMapping: long shape with a note column', () => {
  const g = guessTrackerMapping(['Date', 'Metric', 'Value', 'Unit', 'Note'], [['2024-01-01', 'Pages Read', '12', 'pages', 'x'], ['2024-01-01', 'Meditated', 'yes', '', '']])!
  assert.equal(g.shape, 'long')
  assert.deepEqual(g.columns, { date: 0, metric: 1, value: 2, note: 4 })
  assert.deepEqual(g.metrics, { 'Pages Read': { slug: 'pages-read' }, Meditated: { slug: 'meditated' } })
})

test('guessTrackerMapping: wide shape, one metric per numeric column', () => {
  const g = guessTrackerMapping(['Day', 'Pages read', 'Meditated', 'Comment'], [['2024-01-01', '12', 'yes', 'ok'], ['2024-01-02', '8', 'no', '']])!
  assert.equal(g.shape, 'wide')
  assert.deepEqual(Object.keys(g.metrics), ['Pages read', 'Meditated'])
  assert.equal(g.dates.format, 'YYYY-MM-DD')
  assert.equal(guessTrackerMapping(['Name', 'Colour'], [['a', 'b']]), null)
})

test('readTrackerRow reads long and wide rows and says why a row is skipped', () => {
  const wide: TrackerCsvMapping = { kind: 'tracker-csv', headerRow: 0, delimiter: ',', decimal: '.', dateFormat: 'DD/MM/YYYY', shape: 'wide', columns: { date: 0 }, metrics: { Pages: { slug: 'pages', unit: 'pages' } } }
  assert.deepEqual(readTrackerRow(['05/01/2024', '12'], wide, 2, ['Date', 'Pages']), { ok: true, rows: [{ date: '2024-01-05', slug: 'pages', value: 12, unit: 'pages' }] })
  assert.deepEqual(readTrackerRow(['x', '12'], wide, 3, ['Date', 'Pages']), { ok: false, reason: 'row 3: no date' })
  assert.deepEqual(readTrackerRow(['05/01/2024', ''], wide, 4, ['Date', 'Pages']), { ok: false, reason: 'row 4: no values' })
  const long: TrackerCsvMapping = { ...wide, shape: 'long', columns: { date: 0, metric: 1, value: 2 }, metrics: { Pages: { slug: 'pages' } } }
  assert.deepEqual(readTrackerRow(['05/01/2024', 'Pages', '7'], long, 2), { ok: true, rows: [{ date: '2024-01-05', slug: 'pages', value: 7 }] })
  assert.deepEqual(readTrackerRow(['05/01/2024', 'Steps', '7'], long, 5), { ok: false, reason: 'row 5: "Steps" is not mapped' })
  assert.deepEqual(readTrackerRow(['05/01/2024', 'Pages', 'lots'], long, 6), { ok: false, reason: 'row 6: no value' })
})
