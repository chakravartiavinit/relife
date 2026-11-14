import { SaxesParser } from 'saxes'
import { localDate, wallToUtc } from '@/core/time'
import type { RawEvent } from '@/core/types'
import { HEALTH_TYPES, HealthDays } from '@/domain/health-export'
import type { ZipPreview } from '@/domain/imports'
import { dayEventId } from '@/parsers/util'
import { listZip, withEntry, type ZipEntry } from './files'
import type { EmitCtx, EmitResult } from './kinds'

// Apple Health export.zip: export.xml is streamed through a SAX parser, so a 2 GB file stays flat in memory. The
// folder name may be localized (apple_health_export, Exportación…), so any `*/export.xml` matches. Everything else in
// the zip (export_cda.xml, GPX routes, ECGs) is never opened.

const isExportXml = (name: string) => /(^|\/)export\.xml$/i.test(name)
const mb = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1e6))} MB`)

async function findExport(file: string): Promise<ZipEntry | null> {
  return (await listZip(file)).find((e) => isExportXml(e.fileName)) ?? null
}

export async function previewAppleHealth(file: string): Promise<ZipPreview | { ok: false; error: string }> {
  let entry: ZipEntry | null
  try { entry = await findExport(file) } catch { return { ok: false, error: "This isn't a zip file." } }
  if (!entry) return { ok: false, error: 'No export.xml in this zip. In the Health app, tap your picture, then Export All Health Data.' }
  return { ok: true, kind: 'apple-health', found: [`export.xml (${mb(entry.uncompressedSize)}): steps, distance, flights, active energy, weight, resting heart rate, mindful minutes and sleep`] }
}

export async function emitAppleHealth(file: string, ctx: EmitCtx): Promise<EmitResult> {
  const entry = await findExport(file)
  if (!entry) throw new Error('No export.xml in this zip')
  const tz = ctx.user.timezone
  const cache = new Map<number, string>()
  const days = new HealthDays((ms) => {
    const key = Math.floor(ms / 60_000)
    let d = cache.get(key)
    if (!d) { if (cache.size > 50_000) cache.clear(); d = localDate(new Date(ms), tz); cache.set(key, d) }
    return d
  })
  const parser = new SaxesParser()
  parser.on('opentag', (node) => {
    if (node.name !== 'Record') return
    const type = node.attributes.type as string | undefined
    if (type && HEALTH_TYPES.has(type)) days.add(node.attributes as Record<string, string>)
  })
  let failure: Error | null = null
  parser.on('error', (e) => { failure = e })
  let read = 0, lastReport = 0
  await withEntry(file, entry, async (stream) => {
    stream.setEncoding('utf8')
    for await (const chunk of stream as AsyncIterable<string>) {
      read += Buffer.byteLength(chunk)
      parser.write(chunk)
      if (failure) throw new Error(`export.xml could not be read: ${(failure as Error).message}`)
      if (read - lastReport > 32 * 1024 * 1024) { lastReport = read; await ctx.progress({ phase: 'Reading', done: Math.min(read, entry.uncompressedSize), total: entry.uncompressedSize }) }
    }
    parser.close()
  })
  const all = days.days()
  if (!all.size) return { rows: 0, invalid: 0, invalidSamples: [], note: 'No steps, sleep, weight or other supported Health data found in export.xml.' }
  await ctx.progress({ phase: 'Saving', done: 0, total: all.size })
  let rows = 0, done = 0
  let batch: RawEvent[] = []
  let from: string | undefined, to: string | undefined
  for (const [date, day] of [...all].sort(([a], [b]) => (a < b ? -1 : 1))) {
    rows += Object.keys(day.metrics).length + (day.sleepHours !== undefined ? 1 : 0)
    batch.push({
      source: 'apple-health-export', externalId: dayEventId(date),
      at: wallToUtc(new Date(`${date}T12:00:00Z`), tz),
      body: { importId: ctx.importId, date, metrics: day.metrics, ...(day.sleepHours !== undefined ? { sleepHours: day.sleepHours } : {}) },
    })
    if (!from) from = date
    to = date
    if (batch.length >= 1000) { done += batch.length; await ctx.send(batch); batch = []; await ctx.progress({ phase: 'Saving', done, total: all.size }) }
  }
  if (batch.length) await ctx.send(batch)
  return { rows, invalid: 0, invalidSamples: [], from, to }
}
