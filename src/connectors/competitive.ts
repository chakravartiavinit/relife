import { createHash } from 'node:crypto'
import type { Connector, ConnectorCtx } from '@/core/types'
import { env } from '@/core/env'
import { addDays, localDate, wallToUtc } from '@/core/time'

// Competitive programming from public handles: no key, no login. Each sync rebuilds whole days
// (problems solved, submissions, contest rating) and emits one raw event per day and site;
// src/parsers/competitive.ts turns them into cp.solved, cp.submissions and cp.rating-<site>.
// First sync backfills about 90 days; later ones the last few days.

export type CpDay = {
  platform: 'codeforces' | 'atcoder' | 'codechef'
  date: string
  /** Distinct problems accepted that day (first accepted in the synced window). */
  solved: number
  submissions: number
  /** Contest rating after the day's last rated contest, or today's current rating. */
  rating?: number
  contests: number
}

const UA = { 'User-Agent': 'Mozilla/5.0 (ReLife self-hosted tracker)' }

async function get(url: string) {
  const res = await fetch(url, { headers: UA })
  if (res.status === 404) throw new Error('Handle not found. Check the spelling.')
  if (res.status === 429 || res.status === 503) throw new Error('Rate limited. It will try again next hour.')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res
}

/** Turn timed submissions and ratings into days. Pure, exported for tests. */
export function cpDays(platform: CpDay['platform'], input: {
  submissions: { at: number; problem: string; accepted: boolean }[]
  ratings: { at: number; rating: number }[]
  current?: number
}, tz: string, from: string, today: string) {
  const days = new Map<string, CpDay>()
  const day = (date: string) => days.get(date) ?? days.set(date, { platform, date, solved: 0, submissions: 0, contests: 0 }).get(date)!
  const firstAc = new Map<string, number>()
  for (const s of input.submissions) if (s.accepted && (!firstAc.has(s.problem) || s.at < firstAc.get(s.problem)!)) firstAc.set(s.problem, s.at)
  for (const s of input.submissions) {
    const date = localDate(new Date(s.at), tz)
    if (date < from) continue
    day(date).submissions++
  }
  for (const at of firstAc.values()) {
    const date = localDate(new Date(at), tz)
    if (date >= from) day(date).solved++
  }
  for (const r of [...input.ratings].sort((a, b) => a.at - b.at)) {
    const date = localDate(new Date(r.at), tz)
    if (date < from) continue
    const d = day(date)
    d.rating = r.rating
    d.contests++
  }
  if (input.current && !days.get(today)?.rating) day(today).rating = input.current
  return days
}

async function emitDays(ctx: ConnectorCtx, days: Iterable<CpDay>) {
  const now = new Date()
  for (const d of days) {
    const hash = createHash('sha256').update(JSON.stringify(d)).digest('hex').slice(0, 12)
    await ctx.emit({ source: d.platform, externalId: `${d.date}:${hash}`, at: now, body: d })
  }
}

function window(ctx: ConnectorCtx) {
  const tz = ctx.user.timezone
  const today = localDate(new Date(), tz)
  const backfilled = (ctx.cursor as { backfilled?: boolean } | null)?.backfilled
  return { tz, today, backfilled, from: addDays(today, backfilled ? -3 : -90) }
}

const handleField = (env: string, site: string, example: string) => ({
  env, label: `${site} handle`, placeholder: example, hint: 'Your public handle. No key or login needed.',
})

// ------------------------------------------------------------------------------------------- Codeforces

type CfSubmission = { creationTimeSeconds: number; verdict?: string; problem: { contestId?: number; index: string; name: string } }

export const codeforces: Connector = {
  id: 'codeforces',
  name: 'Codeforces',
  category: 'skills',
  description: 'Problems you solve, submissions and contest rating from your public Codeforces handle.',
  provides: ['Problems solved', 'Rating', 'Contests'],
  fields: [handleField('CODEFORCES_HANDLE', 'Codeforces', 'tourist')],
  env: ['CODEFORCES_HANDLE'],
  everyMinutes: 60,
  async sync(ctx) {
    const h = encodeURIComponent(env('CODEFORCES_HANDLE')!.trim())
    const { tz, today, from, backfilled } = window(ctx)
    const api = async <T>(path: string) => {
      const j = (await (await get(`https://codeforces.com/api/${path}`)).json()) as { status: string; comment?: string; result: T }
      if (j.status !== 'OK') throw new Error(j.comment?.includes('not found') ? 'Handle not found. Check the spelling.' : `Codeforces: ${j.comment}`)
      return j.result
    }
    const [subs, ratings, [info]] = await Promise.all([
      api<CfSubmission[]>(`user.status?handle=${h}&from=1&count=${backfilled ? 300 : 3000}`),
      api<{ ratingUpdateTimeSeconds: number; newRating: number }[]>(`user.rating?handle=${h}`),
      api<{ rating?: number }[]>(`user.info?handles=${h}`),
    ])
    const days = cpDays('codeforces', {
      submissions: subs.map((s) => ({ at: s.creationTimeSeconds * 1000, problem: `${s.problem.contestId ?? ''}${s.problem.index}:${s.problem.name}`, accepted: s.verdict === 'OK' })),
      ratings: ratings.map((r) => ({ at: r.ratingUpdateTimeSeconds * 1000, rating: r.newRating })),
      current: info?.rating,
    }, tz, from, today)
    await emitDays(ctx, days.values())
    ctx.setCursor({ backfilled: true })
    ctx.log(`${subs.length} submissions, ${days.size} days`)
  },
}

// ---------------------------------------------------------------------------------------------- AtCoder

type AcSubmission = { epoch_second: number; problem_id: string; result: string }
type AcHistory = { IsRated: boolean; NewRating: number; EndTime: string }[]

export const atcoder: Connector = {
  id: 'atcoder',
  name: 'AtCoder',
  category: 'skills',
  description: 'Problems you solve and your AtCoder rating, via AtCoder Problems and your public contest history.',
  provides: ['Problems solved', 'Rating', 'Contests'],
  fields: [handleField('ATCODER_HANDLE', 'AtCoder', 'tourist')],
  env: ['ATCODER_HANDLE'],
  everyMinutes: 60,
  async sync(ctx) {
    const h = encodeURIComponent(env('ATCODER_HANDLE')!.trim())
    const { tz, today, from } = window(ctx)
    // AtCoder Problems returns at most 500 submissions per call; walk forward from the window start.
    let since = Math.floor(wallToUtc(new Date(`${addDays(from, -1)}T00:00:00Z`), tz).getTime() / 1000)
    const subs: AcSubmission[] = []
    for (let i = 0; i < 20; i++) {
      const page = (await (await get(`https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions?user=${h}&from_second=${since}`)).json()) as AcSubmission[]
      subs.push(...page)
      if (page.length < 500) break
      since = page[page.length - 1].epoch_second + 1
    }
    const history = (await (await get(`https://atcoder.jp/users/${h}/history/json`)).json()) as AcHistory
    const rated = history.filter((c) => c.IsRated)
    const days = cpDays('atcoder', {
      submissions: subs.map((s) => ({ at: s.epoch_second * 1000, problem: s.problem_id, accepted: s.result === 'AC' })),
      ratings: rated.map((c) => ({ at: Date.parse(c.EndTime), rating: c.NewRating })),
      current: rated.at(-1)?.NewRating,
    }, tz, from, today)
    await emitDays(ctx, days.values())
    ctx.setCursor({ backfilled: true })
    ctx.log(`${subs.length} submissions, ${days.size} days`)
  },
}

// --------------------------------------------------------------------------------------------- CodeChef

/**
 * CodeChef has no public API. The profile page embeds the contest rating history, and the public
 * "recent activity" feed lists submissions (12 a page) with times in India time.
 * ponytail: page scraping; if CodeChef changes its markup this breaks loudly (sync error), not silently.
 */
export function codechefRows(html: string, now: Date) {
  const rows: { at: number; problem: string; accepted: boolean }[] = []
  for (const row of html.match(/<tr >[\s\S]*?<\/tr>/g) ?? []) {
    const when = row.match(/<td\s+title='([^']+)'/)?.[1] ?? ''
    const problem = row.match(/href='[^']*\/problems\/([^']+)'/)?.[1]
    if (!problem) continue
    let at: number | null = null
    const abs = when.match(/(\d{1,2}):(\d{2}) (AM|PM) (\d{2})\/(\d{2})\/(\d{2})/)
    const ago = when.match(/(\d+) (sec|min|hour|day)s? ago/)
    if (abs) {
      const h = (Number(abs[1]) % 12) + (abs[3] === 'PM' ? 12 : 0)
      const wall = new Date(Date.UTC(2000 + Number(abs[6]), Number(abs[5]) - 1, Number(abs[4]), h, Number(abs[2])))
      at = wallToUtc(wall, 'Asia/Kolkata').getTime()
    } else if (ago) {
      at = now.getTime() - Number(ago[1]) * { sec: 1e3, min: 6e4, hour: 36e5, day: 864e5 }[ago[2] as 'sec']
    }
    if (at == null) continue
    rows.push({ at, problem, accepted: /title='accepted'/.test(row) })
  }
  return rows
}

export const codechef: Connector = {
  id: 'codechef',
  name: 'CodeChef',
  category: 'skills',
  description: 'Problems you solve and your contest rating from your public CodeChef profile.',
  provides: ['Problems solved', 'Rating', 'Contests'],
  fields: [handleField('CODECHEF_HANDLE', 'CodeChef', 'gennady.korotkevich')],
  env: ['CODECHEF_HANDLE'],
  everyMinutes: 60,
  async sync(ctx) {
    const h = encodeURIComponent(env('CODECHEF_HANDLE')!.trim())
    const { tz, today, from, backfilled } = window(ctx)
    const profile = await (await get(`https://www.codechef.com/users/${h}`)).text()
    const json = profile.match(/var all_rating = (\[[\s\S]*?\]);/)?.[1]
    const ratings = (json ? (JSON.parse(json) as { rating: string; end_date: string }[]) : [])
      .map((r) => ({ at: wallToUtc(new Date(`${r.end_date.replace(' ', 'T')}Z`), 'Asia/Kolkata').getTime(), rating: Number(r.rating) }))
    const now = new Date()
    const subs: ReturnType<typeof codechefRows> = []
    for (let page = 0; page < (backfilled ? 3 : 25); page++) {
      const j = (await (await get(`https://www.codechef.com/recent/user?page=${page}&user_handle=${h}`)).json()) as { max_page: number; content: string }
      const rows = codechefRows(j.content, now)
      subs.push(...rows)
      if (!rows.length || page + 1 >= j.max_page || localDate(new Date(Math.min(...rows.map((r) => r.at))), tz) < from) break
    }
    const days = cpDays('codechef', { submissions: subs, ratings, current: ratings.at(-1)?.rating }, tz, from, today)
    await emitDays(ctx, days.values())
    ctx.setCursor({ backfilled: true })
    ctx.log(`${subs.length} submissions, ${days.size} days`)
  },
}
