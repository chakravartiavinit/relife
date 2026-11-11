import { createHash } from 'node:crypto'
import type { Connector, ConnectorCtx } from '@/core/types'
import { env } from '@/core/env'
import { addDays, localDate, wallToUtc } from '@/core/time'
import { setTimeout as sleep } from 'node:timers/promises'
import { fetchT, handleOf, retryOnce } from './net'

// Competitive programming from public handles: no key, no login. Each sync rebuilds whole days
// (problems solved, submissions, contest rating) and emits one raw event per day and site;
// src/parsers/competitive.ts turns them into cp.solved, cp.submissions and cp.rating-<site>.
// First sync backfills about 90 days; later ones the last few days.

export type CpDay = {
  platform: 'codeforces' | 'atcoder' | 'codechef' | 'leetcode'
  date: string
  /** Distinct problems accepted that day (first accepted in the synced window). Unknown (LeetCode, older days) = left out. */
  solved?: number
  submissions: number
  /** Contest rating after the day's last rated contest, or today's current rating. */
  rating?: number
  contests: number
}

const UA = { 'User-Agent': 'Mozilla/5.0 (ReLife self-hosted tracker)' }

const notFound = (site: string, h: string, word = 'handle') => `No ${site} user “${h}”. Check the ${word}.`

/** GET with a timeout and errors a person can act on. `missing` is shown for a 404 (and for any redirect when `manual`). */
async function get(url: string, missing = 'Handle not found. Check the spelling.', manual = false) {
  const res = await fetchT(url, { headers: UA, ...(manual ? { redirect: 'manual' as const } : {}) })
  if (res.status === 404 || (manual && res.status >= 300 && res.status < 400)) throw new Error(missing)
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
    if (date >= from) { const d = day(date); d.solved = (d.solved ?? 0) + 1 }
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

/**
 * Codeforces answers a bad handle with HTTP 400 and {status: "FAILED", comment}, and allows about one call every
 * two seconds ("Call limit exceeded"), so calls go one at a time and a refused one is retried once.
 */
async function cfApi<T>(path: string, handle: string, retry = true): Promise<T> {
  const res = await fetchT(`https://codeforces.com/api/${path}`, { headers: UA })
  const j = (await res.json().catch(() => null)) as { status?: string; comment?: string; result?: T } | null
  if (j?.status === 'OK') return j.result as T
  const limited = res.status === 429 || res.status === 503 || /limit exceeded/i.test(j?.comment ?? '')
  if (limited && retry) {
    await sleep(2200)
    return cfApi<T>(path, handle, false)
  }
  if (limited) throw new Error('Rate limited. It will try again next hour.')
  if (/not found/i.test(j?.comment ?? '')) throw new Error(notFound('Codeforces', handle))
  throw new Error(j?.comment ? `Codeforces: ${j.comment}` : `HTTP ${res.status}`)
}

export const codeforces: Connector = {
  id: 'codeforces',
  name: 'Codeforces',
  category: 'skills',
  description: 'Problems you solve, submissions and contest rating from your public Codeforces handle.',
  provides: ['Problems solved', 'Rating', 'Contests'],
  fields: [handleField('CODEFORCES_HANDLE', 'Codeforces', 'tourist')],
  env: ['CODEFORCES_HANDLE'],
  everyMinutes: 60,
  async check(get) {
    const h = handleOf(get('CODEFORCES_HANDLE'))
    await cfApi(`user.info?handles=${encodeURIComponent(h)}`, h)
  },
  async sync(ctx) {
    const handle = handleOf(env('CODEFORCES_HANDLE'))
    const h = encodeURIComponent(handle)
    const { tz, today, from, backfilled } = window(ctx)
    const [info] = await cfApi<{ rating?: number }[]>(`user.info?handles=${h}`, handle)
    const subs = await cfApi<CfSubmission[]>(`user.status?handle=${h}&from=1&count=${backfilled ? 300 : 3000}`, handle)
    const ratings = await cfApi<{ ratingUpdateTimeSeconds: number; newRating: number }[]>(`user.rating?handle=${h}`, handle)
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

type AcSubmission = { id: number; epoch_second: number; problem_id: string; result: string }
type AcHistory = { IsRated: boolean; NewRating: number; EndTime: string }[]

/** AtCoder Problems and the contest history both answer an unknown handle with an empty list; only the profile page says 404. */
const atcoderExists = (h: string) => get(`https://atcoder.jp/users/${encodeURIComponent(h)}`, notFound('AtCoder', h))

export const atcoder: Connector = {
  id: 'atcoder',
  name: 'AtCoder',
  category: 'skills',
  description: 'Problems you solve and your AtCoder rating, via AtCoder Problems and your public contest history.',
  provides: ['Problems solved', 'Rating', 'Contests'],
  fields: [handleField('ATCODER_HANDLE', 'AtCoder', 'tourist')],
  env: ['ATCODER_HANDLE'],
  everyMinutes: 60,
  async check(get) {
    await atcoderExists(handleOf(get('ATCODER_HANDLE')))
  },
  async sync(ctx) {
    const handle = handleOf(env('ATCODER_HANDLE'))
    const h = encodeURIComponent(handle)
    const { tz, today, from } = window(ctx)
    // AtCoder Problems returns at most 500 submissions per call; walk forward from the window start.
    // The next call starts at the last second seen (not one after), so a second split across two pages loses nothing; ids dedupe.
    let since = Math.floor(wallToUtc(new Date(`${addDays(from, -1)}T00:00:00Z`), tz).getTime() / 1000)
    const subs = new Map<number, AcSubmission>()
    for (let i = 0; i < 20; i++) {
      const page = (await (await get(`https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions?user=${h}&from_second=${since}`)).json()) as AcSubmission[]
      const before = subs.size
      for (const s of page) subs.set(s.id, s)
      if (page.length < 500 || subs.size === before) break
      since = page[page.length - 1].epoch_second
    }
    const history = (await (await get(`https://atcoder.jp/users/${h}/history/json`, notFound('AtCoder', handle))).json()) as AcHistory
    if (!subs.size && !history.length) await atcoderExists(handle) // both are empty for a typo too
    const rated = history.filter((c) => c.IsRated)
    const days = cpDays('atcoder', {
      submissions: [...subs.values()].map((s) => ({ at: s.epoch_second * 1000, problem: s.problem_id, accepted: s.result === 'AC' })),
      ratings: rated.map((c) => ({ at: Date.parse(c.EndTime), rating: c.NewRating })),
      current: rated.at(-1)?.NewRating,
    }, tz, from, today)
    await emitDays(ctx, days.values())
    ctx.setCursor({ backfilled: true })
    ctx.log(`${subs.size} submissions, ${days.size} days`)
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

/** The profile page, or an error when the handle doesn't exist (CodeChef redirects those to its home page). */
async function codechefProfile(h: string, handle: string) {
  const url = `https://www.codechef.com/users/${h}`
  // CodeChef throttles bursts: wait a moment and ask once more.
  return retryOnce(async () => (await get(url, notFound('CodeChef', handle), true)).text(), /rate limit/i, 3000)
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
  async check(get) {
    const handle = handleOf(get('CODECHEF_HANDLE'))
    await codechefProfile(encodeURIComponent(handle), handle)
  },
  async sync(ctx) {
    const handle = handleOf(env('CODECHEF_HANDLE'))
    const h = encodeURIComponent(handle)
    const { tz, today, from, backfilled } = window(ctx)
    const profile = await codechefProfile(h, handle)
    const json = profile.match(/var all_rating = (\[[\s\S]*?\]);/)?.[1]
    const ratings = (json ? (JSON.parse(json) as { rating: string; end_date: string }[]) : [])
      .map((r) => ({ at: wallToUtc(new Date(`${r.end_date.replace(' ', 'T')}Z`), 'Asia/Kolkata').getTime(), rating: Number(r.rating) }))
    const now = new Date()
    const subs: ReturnType<typeof codechefRows> = []
    for (let page = 0; page < (backfilled ? 3 : 25); page++) {
      if (page) await sleep(500) // gentle: CodeChef answers 429 to quick bursts
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

// --------------------------------------------------------------------------------------------- LeetCode

type LcData = {
  matchedUser: { userCalendar: { submissionCalendar: string } } | null
  recentAcSubmissionList: { titleSlug: string; timestamp: string }[] | null
  userContestRanking: { rating: number } | null
  userContestRankingHistory: { attended: boolean; rating: number; contest: { startTime: number } }[] | null
}

const LC_QUERY = `query($u: String!) {
  matchedUser(username: $u) { userCalendar { submissionCalendar } }
  recentAcSubmissionList(username: $u, limit: 20) { titleSlug timestamp }
  userContestRanking(username: $u) { rating }
  userContestRankingHistory(username: $u) { attended rating contest { startTime } }
}`

/**
 * Pure: LeetCode's public data into days. Exported for tests.
 * Submissions per day come from the profile calendar (LeetCode counts days in UTC). Problems solved come
 * from the last 20 accepted submissions, the only ones LeetCode shows; when the list is full its oldest day
 * may be cut off, so that day and older ones carry no solved count rather than a wrong one.
 */
export function leetcodeDays(d: LcData, tz: string, from: string, today: string) {
  const days = new Map<string, CpDay>()
  const day = (date: string) => days.get(date) ?? days.set(date, { platform: 'leetcode', date, submissions: 0, contests: 0 }).get(date)!
  const calendar = JSON.parse(d.matchedUser?.userCalendar.submissionCalendar || '{}') as Record<string, number>
  for (const [ts, n] of Object.entries(calendar)) {
    const date = new Date(Number(ts) * 1000).toISOString().slice(0, 10)
    if (date >= from && date <= today) day(date).submissions = n
  }
  const acs = d.recentAcSubmissionList ?? []
  const first = new Map<string, number>()
  for (const a of acs) { const t = Number(a.timestamp) * 1000; if (!first.has(a.titleSlug) || t < first.get(a.titleSlug)!) first.set(a.titleSlug, t) }
  const oldest = acs.map((a) => localDate(new Date(Number(a.timestamp) * 1000), tz)).sort()[0]
  const covered = (date: string) => date >= from && (acs.length < 20 || date > oldest)
  for (const d of days.values()) if (covered(d.date)) d.solved = 0
  for (const t of first.values()) {
    const date = localDate(new Date(t), tz)
    if (covered(date)) { const x = day(date); x.solved = (x.solved ?? 0) + 1 }
  }
  for (const r of (d.userContestRankingHistory ?? []).filter((h) => h.attended).sort((a, b) => a.contest.startTime - b.contest.startTime)) {
    const date = localDate(new Date(r.contest.startTime * 1000), tz)
    if (date < from) continue
    const x = day(date)
    x.rating = Math.round(r.rating)
    x.contests++
  }
  const current = d.userContestRanking?.rating
  if (current && !days.get(today)?.rating) day(today).rating = Math.round(current)
  return days
}

/** One GraphQL call to LeetCode's public endpoint, with errors a person can act on. */
async function leetcodeQuery(query: string, username: string) {
  const res = await fetchT('https://leetcode.com/graphql', {
    method: 'POST',
    headers: { ...UA, 'Content-Type': 'application/json', Referer: 'https://leetcode.com' },
    body: JSON.stringify({ query, variables: { u: username } }),
  })
  if (res.status === 429 || res.status === 403) throw new Error('Rate limited or blocked by LeetCode. It will try again next hour.')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const j = (await res.json()) as { data?: LcData; errors?: { message: string }[] }
  if (!j.data?.matchedUser) throw new Error(j.errors?.some((e) => /does not exist/i.test(e.message)) ? notFound('LeetCode', username, 'username') : `LeetCode: ${j.errors?.[0]?.message ?? 'no data'}`)
  return j.data
}

export const leetcode: Connector = {
  id: 'leetcode',
  name: 'LeetCode',
  category: 'skills',
  description: 'Problems you solve, submissions and contest rating from your public LeetCode profile.',
  provides: ['Problems solved', 'Submissions', 'Rating'],
  fields: [{ env: 'LEETCODE_USERNAME', label: 'LeetCode username', placeholder: 'lee215', hint: 'Your public username, from leetcode.com/u/<name>. No key or login needed.' }],
  env: ['LEETCODE_USERNAME'],
  everyMinutes: 60,
  async check(get) {
    await leetcodeQuery('query($u: String!) { matchedUser(username: $u) { username } }', handleOf(get('LEETCODE_USERNAME')))
  },
  async sync(ctx) {
    const { tz, today, from } = window(ctx)
    const data = await leetcodeQuery(LC_QUERY, handleOf(env('LEETCODE_USERNAME')))
    const days = leetcodeDays(data, tz, from, today)
    await emitDays(ctx, days.values())
    ctx.setCursor({ backfilled: true })
    ctx.log(`${days.size} days`)
  },
}
