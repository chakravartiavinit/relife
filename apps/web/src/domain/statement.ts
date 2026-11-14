import { createHash } from 'node:crypto'
import { detectDateFormat, guessDecimal, parseAmount, parseDate, type Decimal } from './csv'

// Pure rules for bank and card statement CSVs: which column is which, how a row reads, and a stable id per row.

export type StatementColumns = {
  date: number
  description: number
  amount?: number
  debit?: number
  credit?: number
  balance?: number
  /** A column that says Dr or Cr (or Debit, Credit, D, C) next to an unsigned amount. */
  sign?: number
  currency?: number
  ref?: number
}

export type StatementMapping = {
  kind: 'statement'
  headerRow: number
  delimiter: string
  decimal: Decimal
  dateFormat: string
  columns: StatementColumns
  invert: boolean
  currency: string
  account: { name: string; kind: 'bank' | 'card' }
}

const ROLES: [keyof StatementColumns, RegExp][] = [
  ['sign', /^(dr\s*\/?\s*cr|cr\s*\/?\s*dr|d\s*\/\s*c|c\s*\/\s*d|(txn |transaction )?type|debit\s*\/\s*credit|credit\s*\/\s*debit)$/i],
  ['balance', /balance|saldo|closing/i],
  ['debit', /debit|withdraw|paid out|money out|spent|\bdr\b|\bbelastung/i],
  ['credit', /credit|deposit|paid in|money in|received|\bcr\b|\bgutschrift/i],
  ['amount', /amount|betrag|importe|\bamt\b/i],
  ['currency', /currency|ccy|curr\b|währung|moneda/i],
  ['ref', /\bref|cheque|chq|reference|utr|transaction id|txn id|check no/i],
]
const DEBIT_WORD = /^(dr|d|db|debit|withdrawal)\.?$/i
const CREDIT_WORD = /^(cr|c|credit|deposit)\.?$/i
const DATE_EXACT = /^(transaction |trans\.? |txn |posting |posted |booking |buchungs)?(date|datum|fecha|buchungstag)$/i
const DATE_LOOSE = /date|datum|fecha|posting|posted|buchungstag/i
const DESCRIPTION = /description|narration|particulars|details|payee|memo|merchant|text|verwendungszweck|concepto|reference text|remarks?/i

/** Which column is which, from names alone. The decimal mark and date format come from the sample rows. */
export function guessMapping(header: string[], sample: string[][]): {
  columns: Partial<StatementColumns>
  decimal: Decimal
  dates: ReturnType<typeof detectDateFormat>
} {
  const used = new Set<number>()
  const cols: Partial<StatementColumns> = {}
  const take = (role: keyof StatementColumns, test: (h: string, i: number) => boolean) => {
    const i = header.findIndex((h, j) => !used.has(j) && test(h.trim(), j))
    if (i >= 0) { cols[role] = i; used.add(i) }
  }
  take('date', (h) => DATE_EXACT.test(h))
  if (cols.date === undefined) take('date', (h) => DATE_LOOSE.test(h) && !/value date|valuta/i.test(h))
  if (cols.date === undefined) take('date', (h) => DATE_LOOSE.test(h))
  for (const [role, re] of ROLES) take(role, (h) => re.test(h))
  take('description', (h) => DESCRIPTION.test(h))
  // A statement with no obvious description column: the widest text column that is left.
  if (cols.description === undefined) {
    let best = -1, width = 0
    header.forEach((_, j) => {
      if (used.has(j)) return
      const w = sample.reduce((n, r) => n + (r[j]?.trim().length ?? 0), 0)
      if (w > width) { width = w; best = j }
    })
    if (best >= 0) cols.description = best
  }
  const col = (i?: number) => (i === undefined ? [] : sample.map((r) => r[i] ?? '').filter((x) => x.trim()))
  // A column named Dr / Cr (or one a debit or credit name landed on) that only holds those words is a sign marker, not money.
  const onlyWords = (i?: number) => { const v = col(i); return v.length > 0 && v.every((x) => DEBIT_WORD.test(x.trim()) || CREDIT_WORD.test(x.trim())) }
  for (const role of ['debit', 'credit'] as const) {
    if (cols.sign === undefined && cols[role] !== undefined && onlyWords(cols[role])) { cols.sign = cols[role]; delete cols[role] }
  }
  if (cols.sign !== undefined && !onlyWords(cols.sign)) delete cols.sign
  if (cols.sign !== undefined && cols.amount === undefined) delete cols.sign // nothing to sign
  const money = [...col(cols.amount), ...col(cols.debit), ...col(cols.credit)]
  return { columns: cols, decimal: guessDecimal(money), dates: detectDateFormat(col(cols.date)) }
}

/** Whether to flip signs by default: a card statement that lists purchases as positive numbers. */
export function defaultInvert(kind: 'bank' | 'card', amounts: number[]) {
  const nonZero = amounts.filter((a) => a !== 0)
  return kind === 'card' && nonZero.length > 0 && nonZero.filter((a) => a > 0).length / nonZero.length > 0.7
}

/** Signed amount of one row: money out negative. Null when the row holds no amount. */
export function rowAmount(row: string[], m: Pick<StatementMapping, 'columns' | 'decimal' | 'invert'>): number | null {
  const c = m.columns
  let n: number | null = null
  if (c.amount !== undefined) {
    n = parseAmount(row[c.amount] ?? '', m.decimal)
    if (n !== null && c.sign !== undefined) {
      const word = (row[c.sign] ?? '').trim()
      if (DEBIT_WORD.test(word)) n = -Math.abs(n)
      else if (CREDIT_WORD.test(word)) n = Math.abs(n)
    }
    if (n !== null && m.invert) n = -n
  } else {
    const debit = c.debit !== undefined ? parseAmount(row[c.debit] ?? '', m.decimal) : null
    const credit = c.credit !== undefined ? parseAmount(row[c.credit] ?? '', m.decimal) : null
    if (debit === null && credit === null) return null
    n = Math.abs(credit ?? 0) - Math.abs(debit ?? 0)
  }
  return n === null ? null : round2(n) + 0 // + 0 turns -0 into 0
}

export const round2 = (n: number) => Math.round(n * 100) / 100

/** A merchant hint for `categorize()`: long digit runs, card masks and bank prefixes removed. */
export function cleanDescription(s: string): string {
  return s
    .replace(/\b(?:x{2,}|\*{2,})\s*\d*/gi, ' ') // card masks: XXXX1234, ****1234
    .replace(/\d{6,}/g, ' ')
    .replace(/(^|[\s/-])(POS|UPI|IMPS|NEFT|RTGS|ACH|ECS|NACH)(?=[\s/-]|$)/gi, ' ')
    .replace(/[/|*]+/g, ' ')
    .replace(/(^|\s)-+/g, ' ')
    .replace(/-+(\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** `n` counts identical rows earlier in the same file, so two identical coffees on one day stay two rows. */
export function statementRowId(accountKey: string, r: { date: string; amount: number; description: string; balance?: number | null; ref?: string }, n: number) {
  return createHash('sha256')
    .update([accountKey, r.date, r.amount, r.description, r.balance ?? '', r.ref ?? '', n].join('|'))
    .digest('hex').slice(0, 32)
}

/** The `n` for `statementRowId`, row by row in file order: how many identical rows came before this one. */
export function rowCounter() {
  const seen = new Map<string, number>()
  return (r: { date: string; amount: number; description: string; balance?: number | null; ref?: string }) => {
    const same = `${r.date}|${r.amount}|${r.description}|${r.balance ?? ''}|${r.ref ?? ''}`
    const n = seen.get(same) ?? 0
    seen.set(same, n + 1)
    return n
  }
}

export type StatementRow = {
  date: string
  amount: number
  description: string
  currency: string
  balance?: number
  ref?: string
}

/** One row read through a mapping, or why it can't be (shown as "row 14: no date"). */
export function readStatementRow(row: string[], m: StatementMapping, line: number): { ok: true; row: StatementRow } | { ok: false; reason: string } {
  const c = m.columns
  const date = parseDate(row[c.date] ?? '', m.dateFormat)
  if (!date) return { ok: false, reason: `row ${line}: no date` }
  const amount = rowAmount(row, m)
  if (amount === null) return { ok: false, reason: `row ${line}: no amount` }
  const balance = c.balance !== undefined ? parseAmount(row[c.balance] ?? '', m.decimal) : null
  const currency = (c.currency !== undefined ? (row[c.currency] ?? '').trim().toUpperCase() : '') || m.currency
  const ref = c.ref !== undefined ? (row[c.ref] ?? '').trim() : ''
  return {
    ok: true,
    row: {
      date, amount, currency: /^[A-Z]{3}$/.test(currency) ? currency : m.currency,
      description: (row[c.description] ?? '').trim().replace(/\s+/g, ' '),
      ...(balance !== null ? { balance } : {}),
      ...(ref ? { ref } : {}),
    },
  }
}
