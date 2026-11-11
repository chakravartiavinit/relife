import { createHash } from 'node:crypto'
import type { Connector } from '@/core/types'
import { env } from '@/core/env'
import { addDays, localDate } from '@/core/time'
import { fetchT, handleOf } from './net'

// Daily contribution counts via GraphQL. First run backfills 365 days, then the last 14.
// Fine-grained token with read access to your repos (see docs/CONNECTORS.md).

type Cursor = { backfilled?: boolean }
type Day = { date: string; contributions: number; commits: number; prs: number; reviews: number; issues: number }

const QUERY = `
query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar { weeks { contributionDays { date contributionCount } } }
      commitContributionsByRepository(maxRepositories: 100) {
        contributions(first: 100) { nodes { occurredAt commitCount } }
      }
      pullRequestContributions(first: 100) { nodes { occurredAt } }
      pullRequestReviewContributions(first: 100) { nodes { occurredAt } }
      issueContributions(first: 100) { nodes { occurredAt } }
    }
  }
}`

const BAD_TOKEN = 'GitHub rejected the token. Make a new one at github.com/settings/tokens and paste it again.'

/** Turn GitHub's HTTP failures into messages a person can act on. */
function failed(res: Response, what: string) {
  if (res.status === 401) return new Error(BAD_TOKEN)
  if (res.status === 429 || (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') || (res.status === 403 && res.headers.get('retry-after'))) return new Error('Rate limited by GitHub. It will try again on the next sync.')
  if (res.status === 403) return new Error('GitHub refused this token. Check that it has read access to your repositories and hasn’t expired.')
  return new Error(`GitHub ${what}: HTTP ${res.status}`)
}

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetchT('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('GITHUB_TOKEN')!.trim()}`, 'Content-Type': 'application/json', 'User-Agent': 'relife' },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw failed(res, 'query')
  const j = (await res.json()) as { data?: T; errors?: { message: string; type?: string }[] }
  const err = j.errors?.[0]
  if (err?.type === 'NOT_FOUND') throw new Error(`No GitHub user “${variables.login}”. Check the username.`)
  if (err) throw new Error(`GitHub: ${err.message}`)
  return j.data!
}

/** Days of one contribution-calendar window. The calendar pads partial weeks with other days; keep only the window's own. */
export function calendarDays(weeks: { contributionDays: { date: string; contributionCount: number }[] }[], fromDate: string, toDate: string) {
  return weeks.flatMap((w) => w.contributionDays).filter((d) => d.date >= fromDate && d.date <= toDate)
}

/**
 * Commits per local day over the last `days`, from commit search. The contribution calendar can take hours to count
 * a push and groups days in US Pacific time; search sees a push within minutes and gives each commit's own time.
 * ponytail: search returns at most 1,000 commits per query; narrow the window if you commit more in two weeks.
 */
async function recentCommits(login: string, since: string, tz: string) {
  const out = new Map<string, number>()
  for (let page = 1; page <= 10; page++) {
    const q = encodeURIComponent(`author:${login} author-date:>=${since}`)
    const res = await fetchT(`https://api.github.com/search/commits?q=${q}&per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${env('GITHUB_TOKEN')!.trim()}`, Accept: 'application/vnd.github+json', 'User-Agent': 'relife' },
    })
    if (!res.ok) throw res.status === 422 ? new Error(`GitHub couldn’t search commits for “${login}”. Check the username.`) : failed(res, 'commit search')
    const j = (await res.json()) as { items: { commit: { author: { date: string } } }[] }
    for (const c of j.items) {
      const d = localDate(new Date(c.commit.author.date), tz)
      out.set(d, (out.get(d) ?? 0) + 1)
    }
    if (j.items.length < 100) break
  }
  return out
}

type Window = {
  user: {
    contributionsCollection: {
      contributionCalendar: { weeks: { contributionDays: { date: string; contributionCount: number }[] }[] }
      commitContributionsByRepository: { contributions: { nodes: { occurredAt: string; commitCount: number }[] } }[]
      pullRequestContributions: { nodes: { occurredAt: string }[] }
      pullRequestReviewContributions: { nodes: { occurredAt: string }[] }
      issueContributions: { nodes: { occurredAt: string }[] }
    }
  } | null
}

const RECENT_DAYS = 14

export const github: Connector = {
  id: 'github',
  name: 'GitHub',
  category: 'skills',
  description: 'Daily commits, pull requests and reviews across every repo you touch, backfilled a year on first sync.',
  provides: ['Commits', 'Pull requests', 'Reviews'],
  fields: [
    { env: 'GITHUB_TOKEN', label: 'Personal access token', secret: true, placeholder: 'github_pat_…', hint: 'A fine-grained token with read-only access to your repositories, from github.com/settings/tokens.' },
    { env: 'GITHUB_USER', label: 'Username', optional: true, placeholder: 'octocat', hint: 'Leave blank to use the token’s owner.' },
  ],
  env: ['GITHUB_TOKEN'],
  everyMinutes: 30,
  async check(get) {
    const headers = { Authorization: `Bearer ${get('GITHUB_TOKEN')?.trim()}`, Accept: 'application/vnd.github+json', 'User-Agent': 'relife' }
    const me = await fetchT('https://api.github.com/user', { headers })
    if (!me.ok) throw failed(me, 'token check')
    const login = handleOf(get('GITHUB_USER'))
    if (!login) return
    const res = await fetchT(`https://api.github.com/users/${encodeURIComponent(login)}`, { headers })
    if (res.status === 404) throw new Error(`No GitHub user “${login}”. Check the username.`)
    if (!res.ok) throw failed(res, 'user check')
  },
  async sync(ctx) {
    const login = handleOf(env('GITHUB_USER')) || (await gql<{ viewer: { login: string } }>('query { viewer { login } }')).viewer.login
    const cursor = (ctx.cursor as Cursor | null) ?? {}
    const days = cursor.backfilled ? 14 : 365
    const now = new Date()

    // 30-day windows keep each list under the 100-node page size. They start at UTC midnight, so no day is split
    // between two windows (a split day would be counted in part, and the calendar's padding days read as zero).
    // ponytail: >100 PRs or reviews in 30 days would undercount; paginate if that's you.
    const byDate = new Map<string, Day>()
    const midnight = Math.floor(now.getTime() / 86_400_000) * 86_400_000
    for (let back = days; back > 0; back -= 30) {
      const from = new Date(midnight - back * 86_400_000)
      const to = new Date(back <= 30 ? now.getTime() : from.getTime() + 30 * 86_400_000)
      const data = await gql<Window>(QUERY, { login, from: from.toISOString(), to: to.toISOString() })
      const c = data.user?.contributionsCollection
      if (!c) throw new Error(`No GitHub user “${login}”. Check the username.`)
      const day = (date: string) => {
        let d = byDate.get(date)
        if (!d) byDate.set(date, (d = { date, contributions: 0, commits: 0, prs: 0, reviews: 0, issues: 0 }))
        return d
      }
      const lastDay = back <= 30 ? to.toISOString().slice(0, 10) : new Date(to.getTime() - 1).toISOString().slice(0, 10)
      for (const d of calendarDays(c.contributionCalendar.weeks, from.toISOString().slice(0, 10), lastDay)) day(d.date).contributions = d.contributionCount
      // Commit counts come per day already grouped by GitHub (US Pacific), so older days keep GitHub's date;
      // the last two weeks are recounted by your own day below. Pull requests, reviews and issues carry their time.
      const local = (iso: string) => localDate(new Date(iso), ctx.user.timezone)
      for (const r of c.commitContributionsByRepository) for (const n of r.contributions.nodes) day(n.occurredAt.slice(0, 10)).commits += n.commitCount
      for (const n of c.pullRequestContributions.nodes) day(local(n.occurredAt)).prs++
      for (const n of c.pullRequestReviewContributions.nodes) day(local(n.occurredAt)).reviews++
      for (const n of c.issueContributions.nodes) day(local(n.occurredAt)).issues++
    }

    // Recent commits by your own calendar day, as soon as they're pushed (see recentCommits).
    const today = localDate(now, ctx.user.timezone)
    const since = addDays(today, -RECENT_DAYS)
    // Search dates are UTC; start a day early so the first local day is complete, then keep only local days >= since.
    const recent = await recentCommits(login, addDays(since, -1), ctx.user.timezone)
    for (const d of byDate.values()) if (d.date >= since) d.commits = 0
    for (const [date, n] of recent) {
      if (date < since) continue
      if (!byDate.has(date)) byDate.set(date, { date, contributions: 0, commits: 0, prs: 0, reviews: 0, issues: 0 })
      byDate.get(date)!.commits = n
    }

    for (const d of byDate.values()) {
      if (!d.contributions && !d.commits && d.date !== today) continue
      // The id includes the counts, so a day re-syncs when it changes and is skipped when not.
      const hash = createHash('sha256').update(JSON.stringify(d)).digest('hex').slice(0, 12)
      await ctx.emit({ source: 'github', externalId: `${d.date}:${hash}`, at: now, body: d })
    }
    ctx.setCursor({ backfilled: true } satisfies Cursor)
  },
}
