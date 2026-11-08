import { and, desc, eq, gte, lt, lte, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import type { Category } from '@/db/schema'
import { appKey, classify, KIND_INFO, LIBRARY, pageTitle, type ActivityKind, type LibraryKind } from '@/domain/activity'
import { requestJob } from './jobs'
import { saveCover } from './library-images'
import { persist } from './ingest'
import { addDays, localDate } from './time'
import type { User } from './user'

// Laptop activity: stretches of focused time from the browser extension and the Mac watcher. Stored raw
// for 90 days, rolled up into daily screen.* trackers so patterns, XP, the coach and the System see them.

export type SegmentInput = {
  /** Client-made id; the same id again updates the stretch as it grows. */
  id: string
  source: 'browser' | 'mac'
  app?: string | null
  domain?: string | null
  path?: string | null
  title?: string | null
  start: string | number
  end: string | number
  meta?: {
    channel?: string
    playing?: boolean
    course?: CourseInfo
  }
}

/** A library item as the extension describes it: a course, show, book or video series. */
export type CourseInfo = {
  title: string; url?: string; kind?: LibraryKind; image?: string
  /** The site's icon, used as the picture when the page has no cover image. */
  icon?: string
  /** Current lesson or episode, from the page. */
  lesson?: string; done?: number; total?: number
  /** True when you pressed "Track this" (creates the item); otherwise it only updates an existing one. */
  track?: boolean
  /** Added on its own because an episode of it was playing; its kind follows what the site counts as. */
  auto?: boolean
  /** The episode or lesson playing, for the watch log. Seconds. */
  episode?: { episode?: string; number?: number; season?: number; duration?: number; position?: number }
}

/** Which tracker each kind feeds. Learning joins the existing learning.minutes tracker (Skills, XP). */
const ROLLUP: Partial<Record<ActivityKind, { slug: string; name: string; category: Category; direction: 'up' | 'down'; target?: number }>> = {
  learning: { slug: 'learning.minutes', name: 'Learning', category: 'skills', direction: 'up', target: 45 },
  work: { slug: 'screen.work', name: 'Deep work', category: 'skills', direction: 'up' },
  entertainment: { slug: 'screen.entertainment', name: 'Entertainment', category: 'mind', direction: 'down', target: 60 },
  social: { slug: 'screen.social', name: 'Social media', category: 'mind', direction: 'down', target: 30 },
}

const clean = (s: string | null | undefined, n: number) => (s ? s.replace(/\s+/g, ' ').trim().slice(0, n) || null : null)

async function rulesFor(user: User) {
  const rows = await db.select().from(schema.activityRules).where(eq(schema.activityRules.userId, user.id))
  return new Map(rows.map((r) => [r.domain, r.kind]))
}

/** Store or extend stretches, then refresh the totals of every day they touched. */
export async function recordSegments(user: User, segs: SegmentInput[]) {
  const days = new Set<string>()
  const rules = await rulesFor(user)
  let unknown = false
  for (const s of segs) {
    const start = new Date(s.start), end = new Date(s.end)
    if (!(end > start)) continue
    const seconds = Math.min(Math.round((end.getTime() - start.getTime()) / 1000), 6 * 3600)
    const domain = clean(s.domain?.toLowerCase().replace(/^www\./, ''), 120)
    const title = clean(s.title, 300)
    // Time on a tracked item counts as what the item is (a show is entertainment, a course is learning).
    const itemKind = s.meta?.course?.kind
    const kind = itemKind ? LIBRARY[itemKind].counts : classify({ app: s.app, domain, title, channel: s.meta?.channel }, rules)
    if (kind === 'other' && !itemKind && !rules.has(domain ?? (s.app ? appKey(s.app) : ''))) unknown = true
    const date = localDate(start, user.timezone)
    days.add(date)
    const row = {
      userId: user.id, source: s.source, app: clean(s.app, 80), domain, path: clean(s.path, 300), title, kind,
      startedAt: start, endedAt: end, seconds, localDate: date, meta: (s.meta ?? {}) as Record<string, unknown>, ref: `${s.source}:${s.id}`.slice(0, 120),
    }
    await db.insert(schema.activity).values(row)
      .onConflictDoUpdate({ target: [schema.activity.userId, schema.activity.ref], set: { endedAt: end, seconds, title, kind, meta: row.meta } })
    if (s.meta?.course && domain) await trackCourse(user, domain, s.path ?? '', s.meta.course)
  }
  for (const d of days) await rollupDay(user, d)
  // A site or app nobody has sorted yet: let the AI sort it once (skipped when no model is connected).
  if (unknown) await requestJob('activity:classify')
  return days.size
}

/** One day's minutes per kind into the screen.* trackers (and learning.minutes). Re-runs replace the day. */
export async function rollupDay(user: User, date: string) {
  const rows = await db.select({ kind: schema.activity.kind, s: sql<number>`sum(${schema.activity.seconds})::int` }).from(schema.activity)
    .where(and(eq(schema.activity.userId, user.id), eq(schema.activity.localDate, date))).groupBy(schema.activity.kind)
  for (const [kind, r] of Object.entries(ROLLUP) as [ActivityKind, NonNullable<(typeof ROLLUP)[ActivityKind]>][]) {
    const minutes = Math.round((rows.find((x) => x.kind === kind)?.s ?? 0) / 60)
    await persist(user, {
      kind: 'entry', tracker: r.slug, date, value: minutes, source: 'activity', verified: true,
      defaults: { name: r.name, category: r.category, kind: 'duration', unit: 'min', direction: r.direction, target: r.target },
    })
  }
}

/**
 * Library items the extension recognised. One is only created when you press "Track this"; after that,
 * pages that belong to it update its progress and current lesson or episode, and its time is the sum of
 * the stretches tagged with it (plus anything you logged by hand).
 */
export async function trackCourse(user: User, domain: string, path: string, c: CourseInfo) {
  const url = c.url ?? `https://${domain}${path}`
  const items = await db.select().from(schema.learningItems).where(eq(schema.learningItems.userId, user.id))
  let item = items.find((i) => i.url && (url.startsWith(i.url) || i.url === url)) ?? items.find((i) => i.title === c.title && i.provider === domain)
  if (!item && c.track) {
    ;[item] = await db.insert(schema.learningItems).values({
      userId: user.id, title: c.title.slice(0, 200), provider: domain, url, status: 'active', kind: c.kind ?? (c.auto ? await kindForSite(user, domain) : 'course'),
    }).returning()
  }
  if (!item) return null
  if (c.episode) await logEpisode(user, item.id, item.url ?? url, c.episode)
  const [m] = await db.select({ s: sql<number>`coalesce(sum(${schema.activity.seconds}), 0)::int`, last: sql<Date | null>`max(${schema.activity.endedAt})` })
    .from(schema.activity)
    .where(and(eq(schema.activity.userId, user.id), sql`${schema.activity.meta}->'course'->>'url' = ${item.url}`))
  const meta = (item.meta ?? {}) as { manualMinutes?: number; current?: string; iconOnly?: boolean }
  const image = !item.image && (c.image || c.icon) ? await saveCover(item.id, (c.image ?? c.icon)!) : null
  const iconOnly = image ? !c.image : meta.iconOnly
  await db.update(schema.learningItems).set({
    minutesLogged: Math.round(m.s / 60) + (meta.manualMinutes ?? 0),
    lastActiveAt: m.last ? new Date(m.last) : item.lastActiveAt,
    ...(c.track && c.kind && c.kind !== item.kind ? { kind: c.kind } : {}),
    ...(image ? { image } : {}),
    ...(c.lesson || image ? { meta: { ...meta, ...(c.lesson ? { current: c.lesson.slice(0, 200) } : {}), ...(image ? { iconOnly } : {}) } } : {}),
    ...(c.done != null ? { progressDone: Math.max(0, Math.round(c.done)) } : {}),
    ...(c.total ? { progressTotal: Math.round(c.total) } : {}),
    ...(c.done != null && c.total && c.done >= c.total ? { status: 'done' as const } : {}),
    updatedAt: new Date(),
  }).where(eq(schema.learningItems.id, item.id))
  return item.id
}

/** A series added on its own: a course on a learning site, a show on an entertainment one, else a video series. */
async function kindForSite(user: User, domain: string): Promise<LibraryKind> {
  const k = classify({ domain }, await rulesFor(user))
  return k === 'learning' ? 'course' : k === 'entertainment' ? 'show' : 'video'
}

const episodeKey = (e: NonNullable<CourseInfo['episode']>) =>
  e.number != null ? `s${e.season ?? 1}e${e.number}` : (e.episode ?? '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120)

/**
 * One episode into the watch log: its name, number and length, the furthest point reached, and the time spent on it
 * (from the activity stretches tagged with it; never goes down, so it survives their 90-day cleanup).
 */
async function logEpisode(user: User, itemId: string, url: string, e: NonNullable<CourseInfo['episode']>) {
  const key = episodeKey(e)
  if (!key) return
  const [w] = await db.select({ s: sql<number>`coalesce(sum(${schema.activity.seconds}), 0)::int` }).from(schema.activity).where(and(
    eq(schema.activity.userId, user.id),
    sql`${schema.activity.meta}->'course'->>'url' = ${url}`,
    e.number != null
      ? sql`(${schema.activity.meta}->'course'->'episode'->>'number')::int = ${e.number} and coalesce((${schema.activity.meta}->'course'->'episode'->>'season')::int, 1) = ${e.season ?? 1}`
      : sql`lower(${schema.activity.meta}->'course'->'episode'->>'episode') = ${(e.episode ?? '').toLowerCase()}`,
  ))
  const now = new Date()
  await db.insert(schema.libraryEpisodes).values({
    userId: user.id, itemId, key, title: e.episode?.slice(0, 200) ?? null, number: e.number ?? null, season: e.season ?? null,
    durationSec: e.duration ?? null, positionSec: e.position ?? null, watchedSec: w?.s ?? 0, firstAt: now, lastAt: now,
  }).onConflictDoUpdate({
    target: [schema.libraryEpisodes.itemId, schema.libraryEpisodes.key],
    set: {
      title: sql`coalesce(${e.episode?.slice(0, 200) ?? null}, ${schema.libraryEpisodes.title})`,
      durationSec: sql`coalesce(${e.duration ?? null}, ${schema.libraryEpisodes.durationSec})`,
      positionSec: sql`greatest(${schema.libraryEpisodes.positionSec}, ${e.position ?? null})`,
      watchedSec: sql`greatest(${schema.libraryEpisodes.watchedSec}, ${w?.s ?? 0})`,
      lastAt: now,
    },
  })
}

/** Your call on what a site counts as. Re-sorts its stored time (not tracked items) and refreshes the days. */
export async function setSiteKind(user: User, domain: string, kind: ActivityKind | null) {
  const d = domain.toLowerCase().replace(/^www\./, '')
  if (kind) {
    await db.insert(schema.activityRules).values({ userId: user.id, domain: d, kind, source: 'user' })
      .onConflictDoUpdate({ target: [schema.activityRules.userId, schema.activityRules.domain], set: { kind, source: 'user' } })
  } else {
    await db.delete(schema.activityRules).where(and(eq(schema.activityRules.userId, user.id), eq(schema.activityRules.domain, d)))
  }
  return resort(user, [d])
}

/**
 * Re-sort stored time for these sites (or `app:<name>` keys) with the current rules, then refresh the days that
 * changed. Time on tracked items keeps the item's kind. Returns how many days changed.
 */
async function resort(user: User, keys: string[]) {
  const rules = await rulesFor(user)
  const days = new Set<string>()
  for (const key of keys) {
    const app = key.startsWith('app:') ? key.slice(4) : null
    const rows = await db.select().from(schema.activity).where(and(eq(schema.activity.userId, user.id), app
      ? sql`lower(${schema.activity.app}) = ${app} and ${schema.activity.domain} is null`
      : sql`(${schema.activity.domain} = ${key} or ${schema.activity.domain} like ${`%.${key}`})`))
    for (const r of rows) {
      if ((r.meta as { course?: unknown }).course) continue
      const k = classify({ app: r.app, domain: r.domain, title: r.title, channel: (r.meta as { channel?: string }).channel }, rules)
      if (k !== r.kind) { await db.update(schema.activity).set({ kind: k }).where(eq(schema.activity.id, r.id)); days.add(r.localDate) }
    }
  }
  for (const day of days) await rollupDay(user, day)
  return days.size
}

/** Sites and Mac apps that land in "Other" with no rule yet: the AI sorts these once (src/ai/jobs/classify-sites.ts). */
export async function unsortedPlaces(user: User, limit = 40) {
  const rows = await db.select({ domain: schema.activity.domain, app: schema.activity.app, s: sql<number>`sum(${schema.activity.seconds})::int` })
    .from(schema.activity).where(and(eq(schema.activity.userId, user.id), eq(schema.activity.kind, 'other')))
    .groupBy(schema.activity.domain, schema.activity.app).orderBy(desc(sql`sum(${schema.activity.seconds})`))
  const rules = await rulesFor(user)
  const keys = [...new Set(rows.map((r) => (r.domain ? r.domain : r.app ? appKey(r.app) : null)).filter((k): k is string => !!k && !rules.has(k)))]
  return keys.slice(0, limit)
}

/** Save the AI's sorting (never over your own choices) and re-sort those places' past time. */
export async function saveAiKinds(user: User, kinds: { key: string; kind: ActivityKind }[]) {
  for (const { key, kind } of kinds) {
    await db.insert(schema.activityRules).values({ userId: user.id, domain: key, kind, source: 'ai' }).onConflictDoNothing()
  }
  return resort(user, kinds.filter((k) => k.kind !== 'other').map((k) => k.key))
}

/** What a site counts as right now, and whether that's your rule. For the extension popup. */
export async function siteKind(user: User, domain: string) {
  const rules = await rulesFor(user)
  const d = domain.toLowerCase().replace(/^www\./, '')
  return { kind: classify({ domain: d }, rules), custom: rules.has(d) }
}

/** Drop raw stretches older than 90 days; the daily totals stay. */
export async function purgeActivity(user: User, now = new Date()) {
  const cutoff = addDays(localDate(now, user.timezone), -90)
  await db.delete(schema.activity).where(and(eq(schema.activity.userId, user.id), lt(schema.activity.localDate, cutoff)))
}

/** Compact last-7-days view for AI prompts: minutes by kind, top places and videos. Titles only, no URLs. */
export async function screenTimeDigest(user: User, now = new Date()) {
  const today = localDate(now, user.timezone)
  const s = await activitySummary(user, addDays(today, -6), today)
  if (!s.rows) return undefined
  const min = (x: number) => Math.round(x / 60)
  return {
    minutesByKind7d: Object.fromEntries(s.byKind.map((k) => [k.kind, min(k.seconds)])),
    topPlaces7d: s.places.slice(0, 8).map((p) => ({ name: p.name, kind: p.kind, minutes: min(p.seconds) })),
    topPages7d: s.pages.slice(0, 6).map((v) => ({ title: v.title, place: v.place, kind: v.kind, minutes: min(v.seconds) })),
  }
}

/** For the Activity page and the coach: totals by kind and day, top sites and apps, and the pages time went to. */
export async function activitySummary(user: User, from: string, to: string) {
  const rows = await db.select().from(schema.activity)
    .where(and(eq(schema.activity.userId, user.id), gte(schema.activity.localDate, from), lte(schema.activity.localDate, to)))
    .orderBy(desc(schema.activity.startedAt))
  const byKind = new Map<ActivityKind, number>()
  const byPlace = new Map<string, { name: string; source: 'browser' | 'mac'; kind: ActivityKind; seconds: number; kinds: Map<ActivityKind, number> }>()
  const byDay = new Map<string, Map<ActivityKind, number>>()
  // What you were on, across every site and app: one row per place and page title.
  const pages = new Map<string, { title: string; place: string; source: 'browser' | 'mac'; channel?: string; kind: ActivityKind; seconds: number }>()
  for (const r of rows) {
    byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + r.seconds)
    const name = r.domain ?? r.app ?? 'Unknown'
    const p = byPlace.get(name) ?? { name, source: r.source, kind: r.kind, seconds: 0, kinds: new Map() }
    p.seconds += r.seconds
    p.kinds.set(r.kind, (p.kinds.get(r.kind) ?? 0) + r.seconds)
    // A place shows as what it was mostly used for (YouTube can be lessons or entertainment).
    p.kind = [...p.kinds].sort((a, b) => b[1] - a[1])[0][0]
    byPlace.set(name, p)
    const d = byDay.get(r.localDate) ?? byDay.set(r.localDate, new Map()).get(r.localDate)!
    d.set(r.kind, (d.get(r.kind) ?? 0) + r.seconds)
    const title = pageTitle(r.title, name)
    if (title) {
      const key = `${name}|${title}`
      const v = pages.get(key) ?? { title, place: name, source: r.source, channel: (r.meta as { channel?: string }).channel, kind: r.kind, seconds: 0 }
      v.seconds += r.seconds
      pages.set(key, v)
    }
  }
  const total = [...byKind.values()].reduce((a, b) => a + b, 0)
  return {
    total,
    byKind: [...byKind].map(([kind, seconds]) => ({ kind, label: KIND_INFO[kind].label, seconds })).sort((a, b) => b.seconds - a.seconds),
    places: [...byPlace.values()].sort((a, b) => b.seconds - a.seconds).slice(0, 12),
    pages: [...pages.values()].sort((a, b) => b.seconds - a.seconds).slice(0, 10),
    /** For each kind, the places most of its time went to. */
    placesByKind: new Map([...byKind.keys()].map((k) => [k, [...byPlace.values()]
      .map((p) => ({ name: p.name, source: p.source, seconds: p.kinds.get(k) ?? 0 })).filter((p) => p.seconds >= 60)
      .sort((a, b) => b.seconds - a.seconds).slice(0, 3)])),
    byDay,
    rows: rows.length,
  }
}

/** What the browser extension's popup shows: this site today, today's split by kind, and the tracked item. */
export async function popupView(user: User, domain: string | null, itemUrl: string | null, now = new Date()) {
  const today = localDate(now, user.timezone)
  const s = await activitySummary(user, today, today)
  const d = domain?.toLowerCase().replace(/^www\./, '') ?? null
  const site = d ? { ...(await siteKind(user, d)), seconds: s.places.find((p) => p.name === d)?.seconds ?? 0 } : null
  const [item] = itemUrl
    ? await db.select().from(schema.learningItems).where(and(eq(schema.learningItems.userId, user.id), eq(schema.learningItems.url, itemUrl))).limit(1)
    : []
  return {
    site,
    today: { seconds: s.total, byKind: s.byKind.map(({ kind, seconds }) => ({ kind, seconds })) },
    item: item ? {
      id: item.id, title: item.title, kind: item.kind, status: item.status, minutes: item.minutesLogged,
      done: item.progressDone, total: item.progressTotal, current: (item.meta as { current?: string }).current ?? null,
      image: !!item.image, iconOnly: !!(item.meta as { iconOnly?: boolean }).iconOnly, lastActiveAt: item.lastActiveAt,
    } : null,
  }
}
