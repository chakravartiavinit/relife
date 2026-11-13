import { and, eq, like } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/db'
import { categorize } from '@/core/categorize'
import { wallToUtc } from '@/core/time'
import { detectDateFormat, findHeader, headerSignature, parseDate } from '@/domain/csv'
import { isIsoCurrency } from '@/domain/money'
import { slugify } from '@/domain/quicklog'
import { cleanDescription, defaultInvert, guessMapping, readStatementRow, rowAmount, statementRowId, type StatementMapping } from '@/domain/statement'
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
    balance: col.optional(), currency: col.optional(), ref: col.optional(),
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
  const ready = statementMapping.safeParse(base).success && base.columns.date >= 0 && base.columns.description >= 0
  let mapping = base
  if (given) mapping = { ...base, invert: given.invert }
  else if (savedMap) mapping = { ...base, invert: savedMap.invert }
  else if (ready) {
    const amounts = body.map((r) => rowAmount(r, base)).filter((n): n is number => n !== null)
    mapping = { ...base, invert: defaultInvert(base.account.kind, amounts) }
  }
  const out = scan(body, mapping, headerRow, ready)
  const sample: StatementPreview['sample'] = []
  for (const r of out.good.slice(0, 5)) {
    const c = await categorize(user.id, cleanDescription(r.description) || undefined)
    sample.push({ date: r.date, amount: r.amount, merchant: c.merchant ?? r.description, category: r.amount > 0 && c.category === 'Uncategorized' ? 'Income' : c.category })
  }
  return {
    ok: true, kind: 'statement', header, signature, mapping, ready: ready && out.good.length > 0,
    ...(saved && !given ? { savedFrom: saved.fileName } : {}),
    dateChoices: given ? [] : choices(dates.candidates, dateSamples),
    rows: out.good.length, from: out.from, to: out.to, invalid: out.invalid, invalidSamples: out.invalidSamples.slice(0, 5),
    sample, accounts,
  }
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
  const seen = new Map<string, number>()
  let batch: RawEvent[] = []
  let invalid = 0, done = 0, from: string | undefined, to: string | undefined
  const invalidSamples: string[] = []
  for (let i = 0; i < body.length; i++) {
    const res = readStatementRow(body[i], m, m.headerRow + i + 2)
    if (!res.ok) { invalid++; if (invalidSamples.length < 5) invalidSamples.push(res.reason); continue }
    const r = res.row
    const same = `${r.date}|${r.amount}|${r.description}|${r.balance ?? ''}|${r.ref ?? ''}`
    const n = seen.get(same) ?? 0
    seen.set(same, n + 1)
    batch.push({
      source: 'statement', externalId: `${key}:${statementRowId(key, r, n)}`,
      at: wallToUtc(new Date(`${r.date}T12:00:00Z`), ctx.user.timezone),
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
