import type { ImportSummary, StatementPreview, TrackerCsvPreview, ZipPreview } from '@/domain/imports'
import type { StatementMapping } from '@/domain/statement'
import type { TrackerCsvMapping } from '@/domain/tracker-csv'
import type { PastImport } from '../components/imports/import-history'

// Sample data for /dev/ui: invented rows, accounts and files only.

const HEADER = ['Txn Date', 'Narration', 'Withdrawal', 'Deposit', 'Closing Balance']
export const STATEMENT_MAPPING: StatementMapping = {
  kind: 'statement', headerRow: 0, delimiter: ',', decimal: '.', dateFormat: 'DD/MM/YY',
  columns: { date: 0, description: 1, debit: 2, credit: 3, balance: 4 }, invert: false, currency: 'INR', account: { name: 'Sample Bank', kind: 'bank' },
}

export const STATEMENT_PREVIEW: StatementPreview = {
  ok: true, kind: 'statement', header: HEADER, signature: '0123456789abcdef', mapping: STATEMENT_MAPPING, ready: true, savedFrom: 'last Sample Bank file',
  dateChoices: [], rows: 412, invalid: 6, invalidSamples: ['line 1: opening balance', 'line 420: closing balance'], from: '2026-10-01', to: '2026-10-31', linkable: 37, accounts: [],
  sample: [
    { date: '2026-10-03', amount: -412, merchant: 'Swiggy', category: 'Food', match: 'Swiggy' },
    { date: '2026-10-03', amount: 82000, merchant: 'NEFT CR-ACME TECH SALARY', category: 'Income' },
    { date: '2026-10-04', amount: -1299, merchant: 'Amazon', category: 'Shopping', match: 'Amazon' },
    { date: '2026-10-05', amount: -236, merchant: 'Uber', category: 'Transport' },
    { date: '2026-10-06', amount: -22000, merchant: 'IMPS-RENT OCT', category: 'Rent' },
  ],
}

/** A file the app has not seen: two readings of the dates fit, and the amount is still to pick. */
export const STATEMENT_NEW: StatementPreview = {
  ...STATEMENT_PREVIEW, savedFrom: undefined, ready: false, linkable: 0, rows: 0, invalid: 0, invalidSamples: [], sample: [],
  header: ['Posting Date', 'Details', 'Amount (INR)', 'Type'],
  mapping: { ...STATEMENT_MAPPING, dateFormat: 'DD/MM/YYYY', columns: { date: 0, description: 1 } as StatementMapping['columns'], account: { name: 'Card', kind: 'card' } },
  dateChoices: [{ format: 'DD/MM/YYYY', example: '2026-03-04' }, { format: 'MM/DD/YYYY', example: '2026-04-03' }],
}

/** An unsigned amount with a Dr / Cr column, for a file already imported once. */
export const STATEMENT_DRCR: StatementPreview = {
  ...STATEMENT_PREVIEW, savedFrom: undefined, rows: 120, invalid: 0, invalidSamples: [], linkable: 0,
  header: ['Tran Date', 'Particulars', 'Amount', 'Dr / Cr', 'Balance'],
  mapping: { ...STATEMENT_MAPPING, dateFormat: 'DD/MM/YYYY', columns: { date: 0, description: 1, amount: 2, sign: 3, balance: 4 }, account: { name: 'Sample Bank', kind: 'bank' } },
  repeat: { fileName: 'sample-statement-oct-2026.csv', at: '2026-11-10T09:30:00.000Z' },
  sample: [
    { date: '2026-10-03', amount: -412, merchant: 'Swiggy', category: 'Food' },
    { date: '2026-10-03', amount: 82000, merchant: 'NEFT CR-ACME TECH SALARY', category: 'Income' },
    { date: '2026-10-05', amount: -236, merchant: 'Uber', category: 'Transport' },
  ],
}

const TRACKER_MAPPING: TrackerCsvMapping = {
  kind: 'tracker-csv', headerRow: 0, delimiter: ',', decimal: '.', dateFormat: 'YYYY-MM-DD', shape: 'long', columns: { date: 0, metric: 1, value: 2 },
  metrics: { Weight: { slug: 'weight' }, 'Pages read': { slug: 'pages-read' }, Mood: { slug: 'mood' } },
}
export const TRACKER_PREVIEW: TrackerCsvPreview = {
  ok: true, kind: 'tracker-csv', header: ['date', 'metric', 'value'], signature: 'fedcba9876543210', mapping: TRACKER_MAPPING, ready: true, dateChoices: [],
  rows: 96, invalid: 0, invalidSamples: [], from: '2026-08-01', to: '2026-10-31',
  trackers: [{ slug: 'weight', name: 'Weight' }, { slug: 'mood', name: 'Mood' }],
  sample: [{ date: '2026-10-29', slug: 'weight', value: 71.4 }, { date: '2026-10-29', slug: 'pages-read', value: 22 }, { date: '2026-10-30', slug: 'mood', value: 4 }],
}

export const HEALTH_PREVIEW: ZipPreview = {
  ok: true, kind: 'apple-health', from: '2021-03-02', to: '2026-11-10',
  found: ['export.xml (1.8 GB)', 'Steps, sleep, resting heart rate and weight', 'Days from 2 Mar 2021 to 10 Nov 2026'],
}

export const FAIL_MESSAGE = 'This doesn’t look like a statement: no header row with dates was found. Export it as CSV from your bank’s website.'

export const STATEMENT_SUMMARY: ImportSummary = {
  rows: 418, added: 412, duplicates: 0, invalid: 6, invalidSamples: [], linked: 37, linkedBy: { Swiggy: 21, Amazon: 11, Zomato: 5 }, from: '2026-10-01', to: '2026-10-31',
  spend: [{ category: 'Rent', total: 22000 }, { category: 'Food', total: 14230 }, { category: 'Shopping', total: 9870 }, { category: 'Transport', total: 3140 }],
}
export const HEALTH_SUMMARY: ImportSummary = {
  rows: 2090, added: 2052, duplicates: 38, invalid: 0, invalidSamples: [], from: '2021-03-02', to: '2026-11-10',
  trackers: { steps: 1810, 'sleep.hours': 1204, weight: 96 },
}
export const NOTHING_NEW: ImportSummary = { rows: 418, added: 0, duplicates: 418, invalid: 0, invalidSamples: [] }

const at = (d: string) => `${d}T09:30:00.000Z`
export const PAST_IMPORTS: PastImport[] = [
  { id: 'i1', kind: 'apple-health', fileName: 'export.zip', status: 'running', summary: { rows: 0, added: 0, duplicates: 0, invalid: 0, invalidSamples: [] }, error: null, at: at('2026-11-12') },
  { id: 'i2', kind: 'statement', fileName: 'sample-statement-oct-2026.csv', status: 'done', summary: STATEMENT_SUMMARY, error: null, at: at('2026-11-10') },
  { id: 'i3', kind: 'tracker-csv', fileName: 'habits.csv', status: 'done', summary: { rows: 96, added: 96, duplicates: 0, invalid: 0, invalidSamples: [], trackers: { weight: 40, mood: 56 } }, error: null, at: at('2026-11-02') },
  { id: 'i4', kind: 'statement', fileName: 'card-sep.csv', status: 'failed', summary: NOTHING_NEW, error: 'This file could not be read: no rows with a date and an amount.', at: at('2026-10-28') },
  { id: 'i5', kind: 'takeout', fileName: 'takeout-20261001.zip', status: 'undone', summary: { rows: 300, added: 300, duplicates: 0, invalid: 0, invalidSamples: [] }, error: null, at: at('2026-10-01') },
]
