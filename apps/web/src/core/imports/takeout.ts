import { localDate, wallToUtc } from '@/core/time'
import type { RawEvent } from '@/core/types'
import { parseCsv } from '@/domain/csv'
import type { ZipPreview } from '@/domain/imports'
import { dayEventId } from '@/parsers/util'
import { listZip, readEntryText, type ZipEntry } from './files'
import type { EmitCtx, EmitResult } from './kinds'

// Google Takeout, Fit and YouTube only. Fit's daily summary is one small CSV with years of steps; YouTube's watch
// history is the best Mind signal in a Takeout. Everything else is skipped on purpose (Location is too big and too
// private, Chrome overlaps the extension, Calendar has a connector). English headers only.

const FIT = /(^|\/)Fit\/[^/]*(daily (activity metrics|aggregations)|daily metrics)[^/]*\/[^/]+\.csv$/i
const YT_JSON = /(^|\/)YouTube( and YouTube Music)?\/history\/watch-history\.json$/i
const YT_HTML = /(^|\/)YouTube( and YouTube Music)?\/history\/watch-history\.html$/i

const FIT_COLUMNS = { date: 'date', steps: 'step count', distanceM: 'distance (m)', moveMinutes: 'move minutes count', heartPoints: 'heart points' }

type Found = { fit: ZipEntry[]; youtube: ZipEntry | null; youtubeHtml: boolean }

async function scan(file: string): Promise<Found> {
  const entries = await listZip(file)
  return {
    fit: entries.filter((e) => FIT.test(e.fileName) && e.uncompressedSize < 50 * 1024 * 1024),
    youtube: entries.find((e) => YT_JSON.test(e.fileName)) ?? null,
    youtubeHtml: entries.some((e) => YT_HTML.test(e.fileName)),
  }
}

export type FitDay = { date: string; steps?: number; distanceM?: number; moveMinutes?: number; heartPoints?: number }

/** Fit's daily CSV. Returns null when it has no `Date` column or none of the English metric headers. */
export function parseFitCsv(text: string): FitDay[] | null {
  const rows = parseCsv(text)
  if (rows.length < 2) return null
  const h = rows[0].map((c) => c.trim().toLowerCase())
  const at = (name: string) => h.indexOf(name)
  const date = at(FIT_COLUMNS.date)
  const cols = { steps: at(FIT_COLUMNS.steps), distanceM: at(FIT_COLUMNS.distanceM), moveMinutes: at(FIT_COLUMNS.moveMinutes), heartPoints: at(FIT_COLUMNS.heartPoints) }
  if (date < 0 || Object.values(cols).every((i) => i < 0)) return null
  const out: FitDay[] = []
  for (const r of rows.slice(1)) {
    const d = (r[date] ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue
    const num = (i: number) => { const n = i < 0 ? NaN : Number((r[i] ?? '').trim()); return Number.isFinite(n) ? n : undefined }
    out.push({ date: d, steps: num(cols.steps), distanceM: num(cols.distanceM), moveMinutes: num(cols.moveMinutes), heartPoints: num(cols.heartPoints) })
  }
  return out
}

export type WatchItem = { header?: string; time?: string; subtitles?: { name?: string }[]; details?: { name?: string }[] }

/** Videos watched per local day with the day's top channel. Ads and YouTube Music are left out. */
export function youtubeDays(items: WatchItem[], tz: string): Map<string, { videos: number; topChannel?: string }> {
  const days = new Map<string, { videos: number; channels: Map<string, number> }>()
  for (const it of items) {
    if (it.header !== 'YouTube' || !it.time) continue
    if (it.details?.some((d) => /google ads/i.test(d.name ?? ''))) continue
    const t = Date.parse(it.time)
    if (Number.isNaN(t)) continue
    const date = localDate(new Date(t), tz)
    const day = days.get(date) ?? { videos: 0, channels: new Map() }
    day.videos++
    const ch = it.subtitles?.[0]?.name
    if (ch) day.channels.set(ch, (day.channels.get(ch) ?? 0) + 1)
    days.set(date, day)
  }
  return new Map([...days].map(([date, d]) => [date, { videos: d.videos, topChannel: [...d.channels].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] }]))
}

export async function previewTakeout(file: string): Promise<ZipPreview | { ok: false; error: string }> {
  let f: Found
  try { f = await scan(file) } catch { return { ok: false, error: "This isn't a zip file." } }
  if (!f.fit.length && !f.youtube) {
    return { ok: false, error: f.youtubeHtml ? 'Export YouTube history as JSON in Takeout and try again.' : 'No Fit or YouTube files found. In takeout.google.com tick only "Fit" and "YouTube and YouTube Music" (history as JSON).' }
  }
  const found: string[] = []
  let from: string | undefined, to: string | undefined
  if (f.fit.length) {
    const days: FitDay[] = []
    for (const e of f.fit) days.push(...(parseFitCsv(await readEntryText(file, e)) ?? []))
    if (days.length) {
      const dates = days.map((d) => d.date).sort()
      from = dates[0]; to = dates[dates.length - 1]
      found.push(`Fit: ${days.length} days of steps and activity`)
    } else found.push('Fit: found, but the columns are not in English, so it is skipped')
  }
  if (f.youtube) found.push('YouTube: watch history (videos per day)')
  else if (f.youtubeHtml) found.push('YouTube: only the HTML history was found. Export it as JSON to include it')
  return { ok: true, kind: 'takeout', found, from, to }
}

export async function emitTakeout(file: string, ctx: EmitCtx): Promise<EmitResult> {
  const f = await scan(file)
  const tz = ctx.user.timezone
  let rows = 0
  let from: string | undefined, to: string | undefined
  const notes: string[] = []
  const events: RawEvent[] = []
  const at = (date: string) => wallToUtc(new Date(`${date}T12:00:00Z`), tz)
  const span = (d: string) => { if (!from || d < from) from = d; if (!to || d > to) to = d }

  await ctx.progress({ phase: 'Reading', done: 0 })
  let fitDays = 0
  for (const e of f.fit) {
    for (const d of parseFitCsv(await readEntryText(file, e)) ?? []) {
      const n = [d.steps, d.distanceM, d.moveMinutes, d.heartPoints].filter((v) => v !== undefined && v > 0).length
      if (!n) continue
      rows += n; fitDays++; span(d.date)
      events.push({ source: 'google-fit-export', externalId: dayEventId(d.date), at: at(d.date), body: { importId: ctx.importId, ...d } })
    }
  }
  if (f.fit.length && !fitDays) notes.push('The Fit columns are not in English or hold no numbers, so Fit was skipped.')
  if (f.youtube) {
    const items = JSON.parse(await readEntryText(file, f.youtube)) as WatchItem[]
    for (const [date, d] of [...youtubeDays(Array.isArray(items) ? items : [], tz)]) {
      rows++; span(date)
      events.push({ source: 'youtube-history', externalId: dayEventId(date), at: at(date), body: { importId: ctx.importId, date, ...d } })
    }
  } else if (f.youtubeHtml) notes.push('Export YouTube history as JSON in Takeout and try again.')
  await ctx.progress({ phase: 'Saving', done: 0, total: events.length })
  for (let i = 0; i < events.length; i += 1000) await ctx.send(events.slice(i, i + 1000))
  return { rows, invalid: 0, invalidSamples: [], from, to, note: notes.join(' ') || undefined }
}
