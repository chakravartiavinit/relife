import { parseAmount, parseDate, detectDateFormat, guessDecimal, type Decimal } from './csv'
import { slugify } from './quicklog'

// Pure rules for a generic tracker CSV: `date, metric, value[, unit, note]` (long) or `date` plus one column per
// metric (wide).

export type TrackerCsvMapping = {
  kind: 'tracker-csv'
  headerRow: number
  delimiter: string
  decimal: Decimal
  dateFormat: string
  shape: 'long' | 'wide'
  columns: { date: number; metric?: number; value?: number; note?: number }
  /** Column name (wide) or metric name (long) → the tracker it feeds. */
  metrics: Record<string, { slug: string; unit?: string }>
}

const DATE = /^(date|day|datum|fecha|when|timestamp)$|date/i
const METRIC = /^(metric|tracker|type|name|measure|measurement|habit|what)$/i
const VALUE = /^(value|amount|count|qty|quantity|result|score)$/i
const NOTE = /^(note|notes|comment|comments|memo)$/i

/** Parse "12", "1,5" (with a decimal comma), "yes", "no", "true", "false". Null for anything else. */
export function parseTrackerValue(s: string, decimal: Decimal): number | null {
  const t = s.trim().toLowerCase()
  if (!t) return null
  if (['yes', 'y', 'true', 'done', '✓', 'x'].includes(t)) return 1
  if (['no', 'n', 'false', 'skipped'].includes(t)) return 0
  const n = parseAmount(t, decimal)
  return n === null ? null : Math.round(n * 1e6) / 1e6
}

export type TrackerGuess = {
  shape: 'long' | 'wide'
  columns: TrackerCsvMapping['columns']
  decimal: Decimal
  dates: ReturnType<typeof detectDateFormat>
  /** The metric names found (long) or the metric columns (wide), each with a proposed tracker. */
  metrics: TrackerCsvMapping['metrics']
}

/** Long when the header has metric and value columns; else wide, with every column that holds numbers a metric. */
export function guessTrackerMapping(header: string[], sample: string[][]): TrackerGuess | null {
  const h = header.map((x) => x.trim())
  const date = h.findIndex((x) => DATE.test(x))
  if (date < 0) return null
  const metric = h.findIndex((x, i) => i !== date && METRIC.test(x))
  const value = h.findIndex((x, i) => i !== date && VALUE.test(x))
  const note = h.findIndex((x, i) => i !== date && NOTE.test(x))
  const col = (i: number) => sample.map((r) => r[i] ?? '').filter((x) => x.trim())
  const dates = detectDateFormat(col(date))
  const metrics: TrackerCsvMapping['metrics'] = {}
  if (metric >= 0 && value >= 0) {
    for (const name of new Set(col(metric).map((x) => x.trim()))) metrics[name] = { slug: slugify(name) }
    return { shape: 'long', columns: { date, metric, value, ...(note >= 0 ? { note } : {}) }, decimal: guessDecimal(col(value)), dates, metrics }
  }
  const numeric: number[] = []
  h.forEach((name, i) => {
    if (i === date || i === note || !name) return
    const vals = col(i)
    if (vals.length && vals.some((v) => parseTrackerValue(v, '.') !== null || parseTrackerValue(v, ',') !== null)) {
      numeric.push(i)
      metrics[name] = { slug: slugify(name) }
    }
  })
  if (!numeric.length) return null
  return { shape: 'wide', columns: { date, ...(note >= 0 ? { note } : {}) }, decimal: guessDecimal(numeric.flatMap(col)), dates, metrics }
}

export type TrackerRow = { date: string; slug: string; value: number; unit?: string; note?: string }

/** The day-values one CSV row holds (one in long shape, one per mapped column in wide), or why it is skipped. */
export function readTrackerRow(row: string[], m: TrackerCsvMapping, line: number, header: string[] = []): { ok: true; rows: TrackerRow[] } | { ok: false; reason: string } {
  const date = parseDate(row[m.columns.date] ?? '', m.dateFormat)
  if (!date) return { ok: false, reason: `row ${line}: no date` }
  const note = m.columns.note !== undefined ? (row[m.columns.note] ?? '').trim() || undefined : undefined
  if (m.shape === 'long') {
    const name = (row[m.columns.metric ?? -1] ?? '').trim()
    const map = m.metrics[name]
    if (!map) return { ok: false, reason: `row ${line}: ${name ? `"${name}" is not mapped` : 'no metric'}` }
    const value = parseTrackerValue(row[m.columns.value ?? -1] ?? '', m.decimal)
    if (value === null) return { ok: false, reason: `row ${line}: no value` }
    return { ok: true, rows: [{ date, slug: map.slug, value, ...(map.unit ? { unit: map.unit } : {}), ...(note ? { note } : {}) }] }
  }
  const rows: TrackerRow[] = []
  header.forEach((name, i) => {
    const map = m.metrics[name.trim()]
    if (!map || i === m.columns.date) return
    const value = parseTrackerValue(row[i] ?? '', m.decimal)
    if (value !== null) rows.push({ date, slug: map.slug, value, ...(map.unit ? { unit: map.unit } : {}), ...(note ? { note } : {}) })
  })
  return rows.length ? { ok: true, rows } : { ok: false, reason: `row ${line}: no values` }
}
