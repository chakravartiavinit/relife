import { createHash } from 'node:crypto'

// Pure CSV and date helpers shared by the bank statement and tracker CSV imports. No DB, no React.

export type Delimiter = ',' | ';' | '\t' | '|'
const DELIMITERS: Delimiter[] = [',', ';', '\t', '|']

export const stripBom = (s: string) => s.replace(/^﻿/, '')

/** Minimal CSV: quoted fields with "" escapes, any single-character delimiter, CRLF or LF, empty lines skipped. */
export function parseCsv(text: string, delimiter: string = ','): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === delimiter) { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((f) => f.trim())) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((f) => f.trim())) rows.push(row)
  return rows
}

/** The delimiter that splits the first 10 lines into the most (and a steady number of) cells. Quotes are respected. */
export function detectDelimiter(text: string): Delimiter {
  const lines = stripBom(text).split(/\r?\n/).filter((l) => l.trim()).slice(0, 10)
  let best: Delimiter = ','
  let bestScore = 0
  for (const d of DELIMITERS) {
    const counts = lines.map((l) => parseCsv(l, d)[0]?.length ?? 1)
    const n = counts.filter((c) => c > 1).length
    if (!n) continue
    // Prefer a delimiter that gives the same width on many lines, then more columns.
    const mode = Math.max(...counts.map((c) => counts.filter((x) => x === c).length))
    const score = mode * 100 + Math.max(...counts)
    if (score > bestScore) { bestScore = score; best = d }
  }
  return best
}

// ---- Dates ----

export const DATE_FORMATS = [
  'YYYY-MM-DD', 'YYYY/MM/DD',
  'DD/MM/YYYY', 'MM/DD/YYYY', 'DD-MM-YYYY', 'MM-DD-YYYY', 'DD.MM.YYYY', 'DD MMM YYYY', 'MMM D, YYYY',
  'DD/MM/YY', 'MM/DD/YY', 'DD-MM-YY', 'DD.MM.YY', 'DD MMM YY', 'MMM D, YY',
] as const
export type DateFormat = (typeof DATE_FORMATS)[number]

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MON = '([A-Za-z]{3,9})\\.?'
const SHAPES: Record<DateFormat, { re: RegExp; order: ('y' | 'm' | 'd')[] }> = {
  'YYYY-MM-DD': { re: /^(\d{4})-(\d{1,2})-(\d{1,2})$/, order: ['y', 'm', 'd'] },
  'YYYY/MM/DD': { re: /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/, order: ['y', 'm', 'd'] },
  'DD/MM/YYYY': { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, order: ['d', 'm', 'y'] },
  'MM/DD/YYYY': { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, order: ['m', 'd', 'y'] },
  'DD-MM-YYYY': { re: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, order: ['d', 'm', 'y'] },
  'MM-DD-YYYY': { re: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, order: ['m', 'd', 'y'] },
  'DD.MM.YYYY': { re: /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, order: ['d', 'm', 'y'] },
  'DD MMM YYYY': { re: new RegExp(`^(\\d{1,2})[ -]${MON}[ ,-]{1,2}(\\d{4})$`), order: ['d', 'm', 'y'] },
  'MMM D, YYYY': { re: new RegExp(`^${MON} (\\d{1,2}),? (\\d{4})$`), order: ['m', 'd', 'y'] },
  'DD/MM/YY': { re: /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/, order: ['d', 'm', 'y'] },
  'MM/DD/YY': { re: /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/, order: ['m', 'd', 'y'] },
  'DD-MM-YY': { re: /^(\d{1,2})-(\d{1,2})-(\d{2})$/, order: ['d', 'm', 'y'] },
  'DD.MM.YY': { re: /^(\d{1,2})\.(\d{1,2})\.(\d{2})$/, order: ['d', 'm', 'y'] },
  'DD MMM YY': { re: new RegExp(`^(\\d{1,2})[ -]${MON}[ ,-]{1,2}(\\d{2})$`), order: ['d', 'm', 'y'] },
  'MMM D, YY': { re: new RegExp(`^${MON} (\\d{1,2}),? (\\d{2})$`), order: ['m', 'd', 'y'] },
}

// "2024-03-05 10:22:01", "05/03/2024 10:22 PM", "2024-03-05T10:22:00+05:30": the time is not needed.
const TIME_TAIL = /[ T]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?\s*([ap]m)?\s*(z|[+-]\d{2}:?\d{2})?$/i

const clean = (s: string) => s.trim().replace(TIME_TAIL, '').trim()

/** `YYYY-MM-DD` for a real calendar day written in `format`, else null. */
export function parseDate(s: string, format: string): string | null {
  const shape = SHAPES[format as DateFormat]
  if (!shape) return null
  const m = shape.re.exec(clean(s))
  if (!m) return null
  const v: Record<string, number> = {}
  for (let i = 0; i < 3; i++) {
    const k = shape.order[i]
    if (k === 'm' && /[A-Za-z]/.test(m[i + 1])) {
      const idx = MONTHS.indexOf(m[i + 1].slice(0, 3).toLowerCase())
      if (idx < 0) return null
      v.m = idx + 1
    } else v[k] = Number(m[i + 1])
  }
  if (v.y < 100) v.y += v.y < 70 ? 2000 : 1900
  if (v.y < 1970 || v.y > 2100 || v.m < 1 || v.m > 12 || v.d < 1) return null
  const dim = new Date(Date.UTC(v.y, v.m, 0)).getUTCDate()
  if (v.d > dim) return null
  return `${v.y}-${String(v.m).padStart(2, '0')}-${String(v.d).padStart(2, '0')}`
}

export function looksLikeDate(s: string) {
  const c = clean(s)
  return !!c && DATE_FORMATS.some((f) => parseDate(c, f) !== null)
}

export type DateGuess = {
  /** The one format that fits, or null when none fit or the choice is open. */
  format: DateFormat | null
  /** Every format that reads all the samples. More than one means the user has to choose. */
  candidates: DateFormat[]
}

/**
 * The formats that read every sample (a format is dropped when any sample breaks it: a first part over 12 rules
 * out MM/DD, a second part over 12 rules out DD/MM). Two left: the one where the dates run in order (rising or
 * falling) wins. Still two: `format` is null and the UI asks, showing an example date for each.
 */
export function detectDateFormat(samples: string[]): DateGuess {
  const s = samples.map((x) => x.trim()).filter(Boolean)
  if (!s.length) return { format: null, candidates: [] }
  let candidates = DATE_FORMATS.filter((f) => s.every((x) => parseDate(x, f) !== null))
  if (candidates.length > 1) {
    const score = (f: DateFormat) => {
      const d = s.map((x) => parseDate(x, f)!)
      let up = 0, down = 0
      for (let i = 1; i < d.length; i++) { if (d[i] < d[i - 1]) up++; if (d[i] > d[i - 1]) down++ }
      return Math.min(up, down)
    }
    const scores = candidates.map((f) => [f, score(f)] as const)
    const best = Math.min(...scores.map(([, n]) => n))
    const top = scores.filter(([, n]) => n === best).map(([f]) => f)
    if (top.length === 1 && s.length > 2) candidates = top
  }
  return { format: candidates.length === 1 ? candidates[0] : null, candidates }
}

// ---- Numbers ----

export type Decimal = '.' | ','

/** `,` when the numbers look like `1.234,56` or `12,50`; `.` otherwise (`1,234` is thousands). */
export function guessDecimal(samples: string[]): Decimal {
  let comma = 0, dot = 0
  for (const x of samples) {
    const t = x.trim()
    if (/,\d{1,2}(\D*)$/.test(t) && !/\.\d{1,2}(\D*)$/.test(t)) comma++
    else if (/\.\d{1,2}(\D*)$/.test(t)) dot++
  }
  return comma > dot ? ',' : '.'
}

/**
 * A plain number from "1,234.50", "(12.00)", "-₹ 1,299", "1.234,56", "250.00 Dr", "12.00-". Dr is money out
 * (negative), Cr money in. Null when it holds no number.
 */
export function parseAmount(s: string, decimal: Decimal = '.'): number | null {
  let t = s.trim()
  if (!t) return null
  let neg = false
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1) }
  if (/\bdr\.?$/i.test(t)) { neg = true; t = t.replace(/\s*dr\.?$/i, '') }
  else if (/\bcr\.?$/i.test(t)) t = t.replace(/\s*cr\.?$/i, '')
  t = t.replace(/[−–]/g, '-')
  t = t.replace(/^[^\d\-(.,]+\.?\s*(?=[\d\-(.,])/, '') // a prefix such as "Rs." or "USD " (its dot is not a decimal mark)
  if (t.includes('-')) { neg = !neg; t = t.replace(/-/g, '') } // a leading or trailing minus
  t = t.replace(/[^\d.,]/g, '') // currency signs and codes, spaces, apostrophes
  if (!t) return null
  t = decimal === ',' ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return null
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  return neg ? -n : n
}

// ---- Headers ----

/**
 * The header row: the first of the top 30 rows with at least 3 cells whose next row has a date-like cell. Some banks
 * print account details above the table. -1 when there is none.
 */
export function findHeader(rows: string[][]): number {
  const top = Math.min(rows.length - 1, 30)
  for (let i = 0; i < top; i++) {
    const cells = rows[i].filter((c) => c.trim())
    if (cells.length < 3) continue
    if (rows[i + 1].some((c) => looksLikeDate(c))) return i
  }
  return -1
}

/** 16 hex characters that name a header: the saved mapping for a bank is found by it. */
export function headerSignature(cells: string[]) {
  return createHash('sha256').update(cells.map((c) => c.trim().toLowerCase()).join('|')).digest('hex').slice(0, 16)
}

// ── Writing (data export) ──

export type CsvCell = string | number | boolean | Date | null | undefined

/** Text that a spreadsheet would run as a formula starts with one of these. */
const FORMULA = /^[-=+@\t\r]/

function cell(v: CsvCell): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  let s = v instanceof Date ? v.toISOString() : v
  if (FORMULA.test(s)) s = `'${s}` // formula injection: Excel and Sheets show the text, not the result
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

/** One CSV line, ending in CRLF. Numbers are left alone; text that starts with `- = + @ TAB CR` gets a `'` prefix. */
export function csvRow(values: CsvCell[]): string {
  return values.map(cell).join(',') + '\r\n'
}
