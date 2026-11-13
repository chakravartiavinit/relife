import type { StatementMapping } from './statement'
import type { TrackerCsvMapping } from './tracker-csv'

// Shared shapes of the file imports (src/core/imports). Pure types and the small rules the client also needs.

export const IMPORT_KINDS = ['statement', 'apple-health', 'takeout', 'tracker-csv'] as const
export type ImportKind = (typeof IMPORT_KINDS)[number]
export type ImportStatus = 'uploading' | 'uploaded' | 'queued' | 'running' | 'done' | 'failed' | 'undone' | 'cancelled'

export type ImportMapping = StatementMapping | TrackerCsvMapping

export type ImportProgress = { phase: string; done: number; total?: number }

export type ImportSummary = {
  rows: number
  added: number
  duplicates: number
  invalid: number
  invalidSamples: string[]
  /** Statement rows matched to an app order and counted once. */
  linked?: number
  from?: string
  to?: string
  /** Days added per tracker (Health, Takeout and tracker CSV imports). */
  trackers?: Record<string, number>
  /** Something the user should know, e.g. "No Fit files found". */
  note?: string
}

export const KIND_LABEL: Record<ImportKind, string> = {
  statement: 'Bank or card statement',
  'apple-health': 'Apple Health',
  takeout: 'Google Takeout',
  'tracker-csv': 'Tracker CSV',
}

/** Statements and tracker CSVs are read whole in the preview, so they have a small cap (MB). */
export const CSV_MAX_MB = 25
/** One upload request carries at most this much: the proxy buffers a body up to 10 MB. */
export const CHUNK_BYTES = 8 * 1024 * 1024
export const isCsvKind = (k: ImportKind) => k === 'statement' || k === 'tracker-csv'

/** The kind a file name suggests, to pre-select it in the picker. */
export function sniffKind(fileName: string): ImportKind | null {
  const n = fileName.toLowerCase()
  if (/\.csv$|\.txt$/.test(n)) return /binance/.test(n) ? null : 'statement'
  if (/\.zip$/.test(n)) return /takeout/.test(n) ? 'takeout' : /export/.test(n) || /health/.test(n) ? 'apple-health' : null
  return null
}

/** The first line of the result: "412 rows added · 37 matched app orders, counted once · 2 skipped". */
export function summaryLine(kind: ImportKind, s: ImportSummary): string {
  if (!s.added && !s.invalid) return 'Already imported: nothing new'
  const unit = kind === 'statement' ? 'rows' : 'days'
  const parts = [`${s.added.toLocaleString('en-US')} ${s.added === 1 ? unit.replace(/s$/, '') : unit} added`]
  if (s.linked) parts.push(`${s.linked} matched app ${s.linked === 1 ? 'order' : 'orders'}, counted once`)
  if (s.invalid) parts.push(`${s.invalid} skipped`)
  return parts.join(' · ')
}

// ---- Previews (what the dialog shows before Start). Plain JSON: they cross the server action boundary. ----

export type DateChoice = { format: string; example: string }

type PreviewBase = { ok: true; rows: number; from?: string; to?: string; invalid: number; invalidSamples: string[] }

export type StatementPreview = PreviewBase & {
  kind: 'statement'
  header: string[]
  signature: string
  /** Always set. `ready` says whether it holds every required column. Unknown columns are -1. */
  mapping: StatementMapping
  ready: boolean
  /** The newest earlier import with this header, whose mapping is used. */
  savedFrom?: string
  /** More than one date format reads every date: the user chooses, with an example for each. */
  dateChoices: DateChoice[]
  sample: { date: string; amount: number; merchant: string; category: string }[]
  accounts: { key: string; name: string; kind: 'bank' | 'card' }[]
}

export type TrackerCsvPreview = PreviewBase & {
  kind: 'tracker-csv'
  header: string[]
  signature: string
  mapping: TrackerCsvMapping
  ready: boolean
  savedFrom?: string
  dateChoices: DateChoice[]
  sample: { date: string; slug: string; value: number }[]
  trackers: { slug: string; name: string }[]
}

export type ZipPreview = {
  ok: true
  kind: 'apple-health' | 'takeout'
  /** One line per thing found: "export.xml (1.8 GB)", "Fit: daily activity metrics (2019–2024)". */
  found: string[]
  from?: string
  to?: string
}

export type PreviewFail = { ok: false; error: string }
export type ImportPreview = StatementPreview | TrackerCsvPreview | ZipPreview | PreviewFail
