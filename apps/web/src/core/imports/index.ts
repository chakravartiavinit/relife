import { mkdir, open, rm, stat, statfs, appendFile } from 'node:fs/promises'
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { env } from '@/core/env'
import { emitRawMany } from '@/core/ingest'
import { dataDir } from '@/core/paths'
import { lockUser } from '@/core/recovery'
import { linkStatements } from '@/core/statement-link'
import type { User } from '@/core/user'
import {
  CHUNK_BYTES, CSV_MAX_MB, isCsvKind, type ImportKind, type ImportMapping, type ImportPreview, type ImportSummary,
} from '@/domain/imports'
import { emitAppleHealth, previewAppleHealth } from './apple-health'
import type { ImportKindImpl } from './kinds'
import { emitStatement, previewStatement, statementMapping } from './statement'
import { emitTakeout, previewTakeout } from './takeout'
import { emitTrackerCsv, previewTrackerCsv, trackerCsvMapping } from './tracker-csv'

// The import pipeline: upload in chunks (the route handler appends them), preview, queue, run, undo. Every import goes
// through emitRawMany → parser → persist, so dedupe, categorizing and data.changed work as for a connector.

export type ImportRow = typeof schema.imports.$inferSelect
const I = schema.imports

export const importDir = (id: string) => dataDir('imports', id)
export const uploadPath = (id: string) => dataDir('imports', id, 'upload')

const KINDS: Record<ImportKind, ImportKindImpl> = {
  statement: {
    preview: (file, { user, fileName, mapping }) => previewStatement(file, user, fileName, mapping?.kind === 'statement' ? mapping : null),
    emit: emitStatement,
  },
  'tracker-csv': {
    preview: (file, { user, mapping }) => previewTrackerCsv(file, user, mapping?.kind === 'tracker-csv' ? mapping : null),
    emit: emitTrackerCsv,
  },
  'apple-health': { preview: (file) => previewAppleHealth(file), emit: emitAppleHealth },
  takeout: { preview: (file) => previewTakeout(file), emit: emitTakeout },
}

const maxMb = () => Math.max(1, Number(env('RELIFE_IMPORT_MAX_MB')) || 2048)

async function owned(user: User, id: string): Promise<ImportRow> {
  const [row] = await db.select().from(I).where(and(eq(I.id, id), eq(I.userId, user.id)))
  if (!row) throw new Error('Import not found')
  return row
}

/** Starts an upload. Refuses a file over the limit or one the disk can't hold (with room to unpack and parse). */
export async function createImport(user: User, input: { kind: ImportKind; fileName: string; size: number }) {
  const limit = isCsvKind(input.kind) ? Math.min(CSV_MAX_MB, maxMb()) : maxMb()
  if (!(input.size > 0)) throw new Error('That file is empty')
  if (input.size > limit * 1024 * 1024) {
    throw new Error(isCsvKind(input.kind)
      ? `A CSV can be up to ${limit} MB. This one is ${Math.ceil(input.size / 1048576)} MB: export a shorter period.`
      : `Files up to ${limit} MB are accepted. This one is ${Math.ceil(input.size / 1048576)} MB. Raise RELIFE_IMPORT_MAX_MB in .env and restart ReLife.`)
  }
  await mkdir(dataDir('imports'), { recursive: true })
  const fs = await statfs(dataDir('imports'))
  if (fs.bavail * fs.bsize < input.size * 1.1) throw new Error(`Not enough free disk space for a ${Math.ceil(input.size / 1048576)} MB file (ReLife needs about 10% extra).`)
  const [row] = await db.insert(I).values({ userId: user.id, kind: input.kind, fileName: input.fileName.slice(0, 200), sizeBytes: Math.round(input.size) }).returning({ id: I.id })
  await mkdir(importDir(row.id), { recursive: true })
  return { id: row.id, chunkBytes: CHUNK_BYTES }
}

export type ChunkResult = { ok: true; received: number } | { ok: false; status: number; error: string; expected?: number }

/** Appends one chunk. `offset` must equal what was received so far; a mismatch tells the client where to resume. */
export async function appendChunk(user: User, id: string, offset: number, body: Buffer): Promise<ChunkResult> {
  const [row] = await db.select().from(I).where(and(eq(I.id, id), eq(I.userId, user.id)))
  if (!row) return { ok: false, status: 404, error: 'Import not found' }
  if (row.status !== 'uploading') return { ok: false, status: 409, error: 'This upload is already finished', expected: row.receivedBytes }
  if (body.length > CHUNK_BYTES) return { ok: false, status: 413, error: 'Chunk too large' }
  if (offset !== row.receivedBytes) return { ok: false, status: 409, error: 'Out of order', expected: row.receivedBytes }
  if (offset + body.length > row.sizeBytes) return { ok: false, status: 400, error: 'More data than the file size announced' }
  const file = uploadPath(id)
  await appendFile(file, '') // creates it
  const fh = await open(file, 'r+')
  try {
    await fh.truncate(offset) // a crash between write and the row update leaves a longer file: rewrite from the offset
    await fh.write(body, 0, body.length, offset)
  } finally { await fh.close() }
  const received = offset + body.length
  await db.update(I).set({ receivedBytes: received, progress: { phase: 'upload', done: received, total: row.sizeBytes } }).where(and(eq(I.id, id), eq(I.receivedBytes, offset)))
  return { ok: true, received }
}

/** Cancels an upload (or throws away an upload that was never started) and deletes what arrived. */
export async function cancelImport(user: User, id: string) {
  const row = await owned(user, id)
  if (!['uploading', 'uploaded', 'failed'].includes(row.status)) return
  await rm(importDir(id), { recursive: true, force: true })
  await db.update(I).set({ status: 'cancelled' }).where(eq(I.id, id))
}

/** What the dialog shows before Start. `mapping` is the user's current column choice (CSV kinds). */
export async function previewImport(user: User, id: string, mapping?: ImportMapping | null): Promise<ImportPreview> {
  const row = await owned(user, id)
  if (!['uploaded', 'failed'].includes(row.status)) return { ok: false, error: 'This import has already started.' }
  try { await stat(uploadPath(id)) } catch { return { ok: false, error: 'The uploaded file is gone. Pick the file again.' } }
  try {
    const p = await KINDS[row.kind].preview(uploadPath(id), { user, fileName: row.fileName, mapping })
    if (p.ok && 'signature' in p) await db.update(I).set({ signature: p.signature }).where(eq(I.id, id))
    return p
  } catch (e) {
    return { ok: false, error: `This file could not be read: ${e instanceof Error ? e.message : String(e)}` }
  }
}

/** All bytes arrived: marks it uploaded and returns the preview. */
export async function finishUpload(user: User, id: string): Promise<ImportPreview> {
  const row = await owned(user, id)
  if (row.status === 'uploading') {
    if (row.receivedBytes !== row.sizeBytes) return { ok: false, error: `Only ${Math.floor((row.receivedBytes / row.sizeBytes) * 100)}% arrived. Resume the upload.` }
    await db.update(I).set({ status: 'uploaded', progress: { phase: 'ready', done: 0 } }).where(eq(I.id, id))
  }
  return previewImport(user, id)
}

/** Queues the import. CSV kinds need a mapping (validated here); it is saved on the row for the next statement of that bank. */
export async function startImport(user: User, id: string, mapping?: unknown) {
  const row = await owned(user, id)
  if (!['uploaded', 'failed'].includes(row.status)) throw new Error('This import cannot be started again')
  let m: ImportMapping | null = null
  if (row.kind === 'statement') m = statementMapping.parse(mapping) as ImportMapping
  else if (row.kind === 'tracker-csv') m = trackerCsvMapping.parse(mapping) as ImportMapping
  await db.update(I).set({ status: 'queued', mapping: m, error: null, progress: { phase: 'Queued', done: 0 } }).where(eq(I.id, id))
  const { emit } = await import('@/jobs')
  await emit('import.queued')
}

export async function importStatus(user: User, id: string) {
  const r = await owned(user, id)
  return { id: r.id, kind: r.kind, status: r.status, progress: r.progress, summary: r.summary, error: r.error }
}

export async function listImports(user: User, limit = 10) {
  return db.select({
    id: I.id, kind: I.kind, fileName: I.fileName, status: I.status, summary: I.summary, error: I.error, createdAt: I.createdAt, finishedAt: I.finishedAt,
  }).from(I).where(and(eq(I.userId, user.id), inArray(I.status, ['queued', 'running', 'done', 'failed', 'undone']))).orderBy(desc(I.createdAt)).limit(limit)
}

// ---- Running ----

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const STALE_RUN_MIN = 70

/** Queued imports, oldest first, one at a time. A run the process died in is marked failed so it can be retried. */
export async function runQueuedImports(): Promise<string | undefined> {
  await db.update(I).set({ status: 'failed', error: 'ReLife stopped while this import was running. Try again.' })
    .where(and(eq(I.status, 'running'), lt(I.updatedAt, new Date(Date.now() - STALE_RUN_MIN * 60_000))))
  let n = 0
  for (;;) {
    const [row] = await db.select().from(I).where(eq(I.status, 'queued')).orderBy(I.createdAt).limit(1)
    if (!row) break
    await runImport(row)
    n++
  }
  return n ? `${n} import${n === 1 ? '' : 's'}` : undefined
}

async function setProgress(id: string, progress: ImportRow['progress']) {
  await db.update(I).set({ progress }).where(eq(I.id, id))
}

export async function runImport(row: ImportRow) {
  const { id } = row
  try {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, row.userId))
    if (!user) throw new Error('User not found')
    await db.update(I).set({ status: 'running', progress: { phase: 'Reading', done: 0 } }).where(eq(I.id, id))
    const result = await KINDS[row.kind].emit(uploadPath(id), {
      user, importId: id, mapping: row.mapping,
      send: async (events) => { await emitRawMany(user.id, events) },
      progress: (p) => setProgress(id, p),
    })
    await setProgress(id, { phase: 'Saving', done: 0 })
    await waitForParse(id)
    if (row.kind === 'statement' && result.from && result.to) {
      await setProgress(id, { phase: 'Matching orders', done: 0 })
      await linkStatements(user, { from: result.from, to: result.to })
    }
    const summary = await summarize(row.kind, id, result)
    await rm(importDir(id), { recursive: true, force: true })
    await db.update(I).set({ status: 'done', summary, progress: { phase: 'Done', done: summary.added }, finishedAt: new Date(), error: null }).where(eq(I.id, id))
    const { emit } = await import('@/jobs')
    await emit('data.changed')
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[import]', id, message)
    await db.update(I).set({ status: 'failed', error: message.slice(0, 500) }).where(eq(I.id, id))
  }
}

/** Waits until this import's raw events are parsed. Two parse loops must never run at once, so it only runs the job when free. */
async function waitForParse(id: string) {
  const { runNow } = await import('@/jobs')
  const R = schema.rawEvents
  const deadline = Date.now() + 10 * 60_000
  for (;;) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(R).where(and(eq(R.status, 'new'), sql`${R.body}->>'importId' = ${id}`))
    if (!n) return
    if (Date.now() > deadline) throw new Error('Saving is taking too long. Your data is safe: the import can be tried again.')
    const ran = await runNow('parse')
    if (!ran) await sleep(2000)
  }
}

/** Counts from the target tables, so "added" is what is really in the database under this import's id. */
async function summarize(kind: ImportKind, id: string, r: { rows: number; invalid: number; invalidSamples: string[]; from?: string; to?: string; note?: string }): Promise<ImportSummary> {
  let added = 0, linked: number | undefined
  let trackers: Record<string, number> | undefined
  if (kind === 'statement') {
    const T = schema.transactions
    const [c] = await db.select({ n: sql<number>`count(*)::int`, linked: sql<number>`count(${T.linkedTo})::int` }).from(T).where(sql`${T.meta}->>'importId' = ${id}`)
    added = c.n; linked = c.linked
  } else {
    const E = schema.entries
    const rows = await db.select({ slug: schema.trackers.slug, n: sql<number>`count(*)::int` }).from(E)
      .innerJoin(schema.trackers, eq(E.trackerId, schema.trackers.id)).where(sql`${E.meta}->>'importId' = ${id}`).groupBy(schema.trackers.slug)
    trackers = Object.fromEntries(rows.map((x) => [x.slug, x.n]))
    added = rows.reduce((s, x) => s + x.n, 0)
  }
  return {
    rows: r.rows, added, duplicates: Math.max(0, r.rows - added), invalid: r.invalid, invalidSamples: r.invalidSamples,
    ...(linked !== undefined ? { linked } : {}), ...(r.from ? { from: r.from } : {}), ...(r.to ? { to: r.to } : {}),
    ...(trackers ? { trackers } : {}), ...(r.note ? { note: r.note } : {}),
  }
}

// ---- Undo ----

/**
 * Removes what an import added or refreshed: its transactions and entries (by `meta.importId`) and its raw events
 * (`body.importId`). Bank rows linked to app orders go with it; the orders keep counting. One transaction.
 */
export async function undoImport(user: User, id: string): Promise<{ removed: number }> {
  const row = await owned(user, id)
  if (row.status !== 'done') throw new Error('Only a finished import can be removed')
  const removed = await db.transaction(async (tx) => {
    await lockUser(tx, user.id)
    const T = schema.transactions, E = schema.entries, R = schema.rawEvents
    const t = await tx.delete(T).where(and(eq(T.userId, user.id), sql`${T.meta}->>'importId' = ${id}`))
    const e = await tx.delete(E).where(and(eq(E.userId, user.id), sql`${E.meta}->>'importId' = ${id}`))
    await tx.delete(R).where(and(eq(R.userId, user.id), sql`${R.body}->>'importId' = ${id}`))
    // A statement account the import created and nothing else uses.
    await tx.delete(schema.accounts).where(and(
      eq(schema.accounts.userId, user.id), sql`${schema.accounts.key} like 'statement:%'`,
      sql`not exists (select 1 from transactions where transactions.account_id = ${schema.accounts.id})`,
    ))
    await tx.update(I).set({ status: 'undone', undoneAt: new Date() }).where(eq(I.id, id))
    return t.count + e.count
  })
  const { emit } = await import('@/jobs')
  await emit('data.changed')
  return { removed }
}

/** Uploads nobody finished within a day are cancelled and their files removed (called by the daily prune). */
export async function pruneImports(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 24 * 3_600_000)
  const stale = await db.select({ id: I.id, status: I.status }).from(I).where(and(inArray(I.status, ['uploading', 'uploaded', 'failed']), lt(I.updatedAt, cutoff)))
  for (const s of stale) {
    await rm(importDir(s.id), { recursive: true, force: true })
    if (s.status !== 'failed') await db.update(I).set({ status: 'cancelled' }).where(eq(I.id, s.id))
  }
  return stale.length
}

