import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/db'
import { detectDateFormat, findHeader, headerSignature, parseDate } from '@/domain/csv'
import { guessTrackerMapping, readTrackerRow, type TrackerCsvMapping } from '@/domain/tracker-csv'
import type { TrackerCsvPreview } from '@/domain/imports'
import type { RawEvent } from '@/core/types'
import type { User } from '@/core/user'
import { wallToUtc } from '@/core/time'
import { readCsvFile } from './files'
import type { EmitCtx, EmitResult } from './kinds'
import { savedMapping } from './saved'

const col = z.number().int().min(0).max(500)
const slug = z.string().regex(/^[a-z0-9][a-z0-9.-]{0,78}$/, 'Use lowercase letters, numbers, dots and dashes')
export const trackerCsvMapping = z.object({
  kind: z.literal('tracker-csv'),
  headerRow: z.number().int().min(0).max(100),
  delimiter: z.enum([',', ';', '\t', '|']),
  decimal: z.enum(['.', ',']),
  dateFormat: z.string().max(20),
  shape: z.enum(['long', 'wide']),
  columns: z.object({ date: col, metric: col.optional(), value: col.optional(), note: col.optional() }),
  metrics: z.record(z.string().max(120), z.object({ slug, unit: z.string().max(20).optional() })).refine((m) => Object.keys(m).length > 0 && Object.keys(m).length <= 60, 'Pick 1 to 60 metrics'),
}).refine((m) => m.shape === 'wide' || (m.columns.metric !== undefined && m.columns.value !== undefined), 'A long CSV needs a metric column and a value column')

/** A header with a metric+value pair, or a date column and numeric columns. The first row with at least 2 cells. */
function headerOf(rows: string[][]): number {
  const h = findHeader(rows)
  if (h >= 0) return h
  return rows.findIndex((r, i) => r.filter((c) => c.trim()).length >= 2 && i + 1 < rows.length) // no date-like cell in the sample: still a header
}

export async function previewTrackerCsv(file: string, user: User, given?: TrackerCsvMapping | null): Promise<TrackerCsvPreview | { ok: false; error: string }> {
  const { rows, delimiter } = await readCsvFile(file, given?.delimiter)
  const headerRow = headerOf(rows)
  if (headerRow < 0) return { ok: false, error: "This doesn't look like a tracker CSV: it needs a date column and one column per metric (or metric and value columns)." }
  const header = rows[headerRow]
  const body = rows.slice(headerRow + 1)
  const signature = headerSignature(header)
  const saved = given ? null : await savedMapping(user, signature)
  const savedMap = saved?.mapping?.kind === 'tracker-csv' ? saved.mapping : null
  const guess = guessTrackerMapping(header, body.slice(0, 300))
  if (!guess && !given && !savedMap) return { ok: false, error: 'No date column or no numbers were found. A tracker CSV needs a date column and one column per metric, or metric and value columns.' }
  const use = given ?? savedMap
  const dateSamples = body.slice(0, 300).map((r) => r[use?.columns.date ?? guess?.columns.date ?? -1] ?? '')
  const dates = detectDateFormat(dateSamples)
  const mapping: TrackerCsvMapping = use ?? {
    kind: 'tracker-csv', headerRow, delimiter, decimal: guess!.decimal, dateFormat: dates.format ?? dates.candidates[0] ?? 'YYYY-MM-DD',
    shape: guess!.shape, columns: guess!.columns, metrics: guess!.metrics,
  }
  const ok = trackerCsvMapping.safeParse(mapping).success && !!parseDate(dateSamples.find((s) => s.trim()) ?? '', mapping.dateFormat)
  let count = 0, invalid = 0, from: string | undefined, to: string | undefined
  const invalidSamples: string[] = []
  const sample: TrackerCsvPreview['sample'] = []
  if (ok) {
    body.forEach((r, i) => {
      const res = readTrackerRow(r, mapping, headerRow + i + 2, header)
      if (!res.ok) { invalid++; if (invalidSamples.length < 5) invalidSamples.push(res.reason); return }
      for (const v of res.rows) {
        count++
        if (sample.length < 5) sample.push({ date: v.date, slug: v.slug, value: v.value })
        if (!from || v.date < from) from = v.date
        if (!to || v.date > to) to = v.date
      }
    })
  }
  const trackers = await db.select({ slug: schema.trackers.slug, name: schema.trackers.name }).from(schema.trackers)
    .where(and(eq(schema.trackers.userId, user.id)))
  return {
    ok: true, kind: 'tracker-csv', header, signature, mapping, ready: ok && count > 0,
    ...(saved && !given ? { savedFrom: saved.fileName } : {}),
    dateChoices: !given && dates.candidates.length > 1 ? dates.candidates.map((format) => ({ format, example: parseDate(dateSamples.find((s) => s.trim()) ?? '', format) ?? '' })) : [],
    rows: count, from, to, invalid, invalidSamples, sample, trackers,
  }
}

export async function emitTrackerCsv(file: string, ctx: EmitCtx): Promise<EmitResult> {
  const m = ctx.mapping
  if (m?.kind !== 'tracker-csv') throw new Error('This import has no column mapping')
  const { rows } = await readCsvFile(file, m.delimiter)
  const header = rows[m.headerRow] ?? []
  const body = rows.slice(m.headerRow + 1)
  let batch: RawEvent[] = []
  let invalid = 0, count = 0, from: string | undefined, to: string | undefined
  const invalidSamples: string[] = []
  for (let i = 0; i < body.length; i++) {
    const res = readTrackerRow(body[i], m, m.headerRow + i + 2, header)
    if (!res.ok) { invalid++; if (invalidSamples.length < 5) invalidSamples.push(res.reason); continue }
    for (const v of res.rows) {
      count++
      batch.push({
        source: 'tracker-csv', externalId: `day:${v.date}:${v.slug}`, replace: true,
        at: wallToUtc(new Date(`${v.date}T12:00:00Z`), ctx.user.timezone),
        body: { importId: ctx.importId, ...v },
      })
      if (!from || v.date < from) from = v.date
      if (!to || v.date > to) to = v.date
    }
    if (batch.length >= 1000) { await ctx.send(batch); batch = []; await ctx.progress({ phase: 'Reading', done: i + 1, total: body.length }) }
  }
  if (batch.length) await ctx.send(batch)
  return { rows: count, invalid, invalidSamples, from, to }
}
