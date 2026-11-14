import { and, between, eq, like, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/db'
import { categorize } from '@/core/categorize'
import { addDays, wallToUtc } from '@/core/time'
import { matchStatementRows, type LinkOrder, type LinkRow } from '@/domain/statement-link'
import { detectDateFormat, findHeader, headerSignature, parseDate } from '@/domain/csv'
import { isIsoCurrency } from '@/domain/money'
import { slugify } from '@/domain/quicklog'
import { cleanDescription, defaultInvert, guessMapping, readStatementRow, rowAmount, rowCounter, statementRowId, type StatementMapping } from '@/domain/statement'
import type { DateChoice, StatementPreview } from '@/domain/imports'
import type { RawEvent } from '@/core/types'
import type { User } from '@/core/user'
import { readCsvFile } from './files'
import type { EmitCtx, EmitResult } from './kinds'
import { savedMapping } from './saved'

const col = z.number().int().min(0).max(500)
export const statementMapping = z.object({
  kind: z.literal('statement'),
  headerRow: z.number().int().min(0).max(100),
  delimiter: z.enum([',', ';', '\t', '|']),
  decimal: z.enum(['.', ',']),
  dateFormat: z.string().max(20),
  columns: z.object({
    date: col, description: col, amount: col.optional(), debit: col.optional(), credit: col.optional(),
    balance: col.optional(), sign: col.optional(), currency: col.optional(), ref: col.optional(),
  }).refine((c) => c.amount !== undefined || c.debit !== undefined || c.credit !== undefined, 'Pick the amount column, or the debit and credit columns'),
  invert: z.boolean(),
  currency: z.string().trim().toUpperCase().refine(isIsoCurrency, 'Use a currency code like INR or USD'),
  account: z.object({ name: z.string().trim().min(1).max(60), kind: z.enum(['bank', 'card']) }),
})

export const accountKey = (name: string) => `statement:${slugify(name) || 'account'}`

/** Existing statement accounts, so a second statement from the same bank lands in the same account. */
export async function statementAccounts(user: User) {
  const rows = await db.select({ key: schema.accounts.key, name: schema.accounts.name, kind: schema.accounts.kind }).from(schema.accounts)
    .where(and(eq(schema.accounts.userId, user.id), like(schema.accounts.key, 'statement:%')))
  return rows.map((r) => ({ key: r.key, name: r.name, kind: (r.kind === 'card' ? 'card' : 'bank') as 'bank' | 'card' }))
}

const stem = (fileName: string) => fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+\d[\d ]*$/, '').trim().slice(0, 60) || 'Bank account'

function choices(candidates: string[], samples: string[]): DateChoice[] {
  if (candidates.length < 2) return []
  const sample = samples.find((s) => s.trim()) ?? ''
  return candidates.map((format) => ({ format, example: parseDate(sample, format) ?? '' }))
}

export async function previewStatement(file: string, user: User, fileName: string, given?: StatementMapping | null): Promise<StatementPreview | { ok: false; error: string }> {
  const first = await readCsvFile(file, given?.delimiter)
  const { rows, delimiter } = first
  const headerRow = findHeader(rows)
  if (headerRow < 0) return { ok: false, error: "This doesn't look like a statement: no header row with dates was found. Export it as CSV from your bank's website." }
  const header = rows[headerRow]
  const signature = headerSignature(header)
  const body = rows.slice(headerRow + 1)
  const saved = given ? null : await savedMapping(user, signature)
  const savedMap = saved?.mapping?.kind === 'statement' ? saved.mapping : null
  const guess = guessMapping(header, body.slice(0, 300))
  const dateSamples = body.slice(0, 300).map((r) => r[(given ?? savedMap)?.columns.date ?? guess.columns.date ?? -1] ?? '')
  const dates = detectDateFormat(dateSamples)
  const accounts = await statementAccounts(user)
  const columns = given?.columns ?? savedMap?.columns ?? { date: guess.columns.date ?? -1, description: guess.columns.description ?? -1, ...guess.columns }
  const base: StatementMapping = {
    kind: 'statement', headerRow, delimiter, decimal: given?.decimal ?? savedMap?.decimal ?? guess.decimal,
    dateFormat: given?.dateFormat ?? savedMap?.dateFormat ?? dates.format ?? dates.candidates[0] ?? 'YYYY-MM-DD',
    columns: columns as StatementMapping['columns'],
    invert: false, currency: given?.currency ?? savedMap?.currency ?? user.baseCurrency,
    account: given?.account ?? savedMap?.account ?? { name: stem(fileName), kind: 'bank' },
  }
  // More than one date order fits and nothing says which: nothing is read until the user picks one.
  const choose = !given && !savedMap ? choices(dates.candidates, dateSamples) : []
  const ready = statementMapping.safeParse(base).success && base.columns.date >= 0 && base.columns.description >= 0
  let mapping = base
  if (given) mapping = { ...base, invert: given.invert }
  else if (savedMap) mapping = { ...base, invert: savedMap.invert }
  else if (ready) {
    const amounts = body.map((r) => rowAmount(r, base)).filter((n): n is number => n !== null)
    mapping = { ...base, invert: defaultInvert(base.account.kind, amounts) }
  }
  const out = scan(body, mapping, headerRow, ready)
  const matches = await previewMatches(user, out.good, mapping.currency)
  const already = await alreadyImported(user, out.good, accountKey(mapping.account.name), out.from, out.to)
  const sample: StatementPreview['sample'] = []
  for (const [i, r] of out.good.slice(0, 5).entries()) {
    const c = await categorize(user.id, cleanDescription(r.description) || undefined)
    sample.push({ date: r.date, amount: r.amount, merchant: c.merchant ?? r.description, category: r.amount > 0 && c.category === 'Uncategorized' ? 'Income' : c.category, ...(matches.get(i) ? { match: matches.get(i) } : {}), ...(already.has(i) ? { already: true } : {}) })
  }
  return {
    ok: true, kind: 'statement', header, signature, mapping, ready: ready && out.good.length > 0 && !choose.length,
    ...(saved && !given ? { savedFrom: saved.fileName } : {}),
    dateChoices: choose,
    rows: out.good.length, from: out.from, to: out.to, invalid: out.invalid, invalidSamples: out.invalidSamples.slice(0, 5),
    sample, accounts, linkable: matches.size, duplicates: already.size,
  }
}

/**
 * Which rows of this file an earlier import already brought in (the same account and the same row id, which is what the
 * import itself skips on). Row index in `good`. Only that account's rows near the file's dates are read.
 */
async function alreadyImported(user: User, good: { date: string; amount: number; description: string; balance?: number; ref?: string }[], key: string, from?: string, to?: string): Promise<Set<number>> {
  const out = new Set<number>()
  if (!good.length || !from || !to) return out
  const R = schema.rawEvents
  const have = new Set((await db.select({ id: R.externalId }).from(R).where(and(
    eq(R.userId, user.id), eq(R.source, 'statement'), like(R.externalId, `${key}:%`),
    between(R.at, new Date(`${addDays(from, -2)}T00:00:00Z`), new Date(`${addDays(to, 2)}T00:00:00Z`)),
  ))).map((r) => r.id))
  if (!have.size) return out
  const counter = rowCounter()
  good.forEach((r, i) => { if (have.has(`${key}:${statementRowId(key, r, counter(r))}`)) out.add(i) })
  return out
}

/** How an order is named next to a bank row: "Swiggy" for an app order, "Manual spend" for one typed in Capture. */
export const orderLabel = (source: string, platform?: string) => (source === 'manual' || !platform ? 'Manual spend' : platform.charAt(0).toUpperCase() + platform.slice(1))

/**
 * A dry run of the link rule: which rows of this file match an app order (or a manual spend) that no bank row has been
 * linked to yet. Row index → the order's platform. Nothing is written; the import does the linking itself.
 */
async function previewMatches(user: User, good: { date: string; amount: number; description: string }[], currency: string): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  const rows: LinkRow[] = good.flatMap((r, i) => (r.amount < 0 ? [{ id: String(i), localDate: r.date, amount: r.amount, currency, description: r.description }] : []))
  if (!rows.length) return out
  const T = schema.transactions
  const dates = rows.map((r) => r.localDate).sort()
  const [from, to] = [addDays(dates[0], -2), addDays(dates[dates.length - 1], 2)]
  const orders = await db.select().from(T).where(and(eq(T.userId, user.id), sql`(${T.meta}->>'appOrder' = 'true' or ${T.source} = 'manual')`, sql`${T.amount} < 0`, between(T.localDate, from, to)))
  if (!orders.length) return out
  const taken = new Set((await db.select({ linkedTo: T.linkedTo }).from(T).where(and(eq(T.userId, user.id), sql`${T.linkedTo} is not null`))).map((r) => r.linkedTo))
  const free: LinkOrder[] = orders.filter((o) => !taken.has(o.id)).map((o) => ({
    id: o.id, localDate: o.localDate, amount: o.amount, currency: o.currency, platform: (o.meta as { platform?: string }).platform ?? o.merchant, needsName: o.source === 'manual',
  }))
  const name = new Map(orders.map((o) => [o.id, orderLabel(o.source, (o.meta as { platform?: string }).platform)]))
  for (const l of matchStatementRows(rows, free)) out.set(Number(l.rowId), name.get(l.orderId) ?? 'order')
  return out
}

function scan(body: string[][], m: StatementMapping, headerRow: number, ready: boolean) {
  const good: NonNullable<ReturnType<typeof readStatementRow> & { ok: true }>['row'][] = []
  const invalidSamples: string[] = []
  let invalid = 0, from: string | undefined, to: string | undefined
  if (!ready) return { good, invalid, invalidSamples, from, to }
  body.forEach((r, i) => {
    const res = readStatementRow(r, m, headerRow + i + 2)
    if (!res.ok) { invalid++; if (invalidSamples.length < 5) invalidSamples.push(res.reason); return }
    good.push(res.row)
    if (!from || res.row.date < from) from = res.row.date
    if (!to || res.row.date > to) to = res.row.date
  })
  return { good, invalid, invalidSamples, from, to }
}

/** The raw events of one statement. Identical rows in one file get a counter, so two coffees stay two rows. */
export async function emitStatement(file: string, ctx: EmitCtx): Promise<EmitResult> {
  const m = ctx.mapping
  if (m?.kind !== 'statement') throw new Error('This import has no column mapping')
  const { rows } = await readCsvFile(file, m.delimiter)
  const body = rows.slice(m.headerRow + 1)
  const key = accountKey(m.account.name)
  const counter = rowCounter()
  // Rows of one day share a time, and the account takes the balance of the latest one. A millisecond per row in time
  // order (newest-first files are read backwards) makes the closing balance the last row of the day, every time.
  const dates = body.map((r) => parseDate(r[m.columns.date] ?? '', m.dateFormat)).filter((d): d is string => !!d)
  const newestFirst = dates.length > 1 && dates[0] > dates[dates.length - 1]
  let batch: RawEvent[] = []
  let invalid = 0, done = 0, from: string | undefined, to: string | undefined
  const invalidSamples: string[] = []
  for (let i = 0; i < body.length; i++) {
    const res = readStatementRow(body[i], m, m.headerRow + i + 2)
    if (!res.ok) { invalid++; if (invalidSamples.length < 5) invalidSamples.push(res.reason); continue }
    const r = res.row
    batch.push({
      source: 'statement', externalId: `${key}:${statementRowId(key, r, counter(r))}`,
      at: new Date(wallToUtc(new Date(`${r.date}T12:00:00Z`), ctx.user.timezone).getTime() + (newestFirst ? body.length - 1 - i : i)),
      body: { importId: ctx.importId, account: { key, name: m.account.name, kind: m.account.kind }, ...r },
    })
    if (!from || r.date < from) from = r.date
    if (!to || r.date > to) to = r.date
    done++
    if (batch.length >= 1000) { await ctx.send(batch); batch = []; if (done % 2000 === 0) await ctx.progress({ phase: 'Reading', done, total: body.length }) }
  }
  if (batch.length) await ctx.send(batch)
  return { rows: done, invalid, invalidSamples, from, to, accountKey: key }
}
