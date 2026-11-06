import { createHash } from 'node:crypto'
import type { Connector } from '@/core/types'
import { env } from '@/core/env'

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

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('GITHUB_TOKEN')}`, 'Content-Type': 'application/json', 'User-Agent': 'relife' },
    body: JSON.stringify({ query, variables }),
  })
  const j = (await res.json()) as { data?: T; errors?: { message: string }[] }
  if (!res.ok || j.errors?.length) throw new Error(`GitHub: ${j.errors?.[0]?.message ?? `HTTP ${res.status}`}`)
  return j.data!
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
  everyMinutes: 60,
  async sync(ctx) {
    const login = env('GITHUB_USER') || (await gql<{ viewer: { login: string } }>('query { viewer { login } }')).viewer.login
    const cursor = (ctx.cursor as Cursor | null) ?? {}
    const days = cursor.backfilled ? 14 : 365
    const now = new Date()

    // 30-day windows keep each list under the 100-node page size.
    // ponytail: >100 PRs or reviews in 30 days would undercount; paginate if that's you.
    const byDate = new Map<string, Day>()
    for (let back = days; back > 0; back -= 30) {
      const from = new Date(now.getTime() - back * 86_400_000)
      const to = new Date(Math.min(now.getTime(), from.getTime() + 30 * 86_400_000))
      const data = await gql<Window>(QUERY, { login, from: from.toISOString(), to: to.toISOString() })
      const c = data.user?.contributionsCollection
      if (!c) throw new Error(`GitHub user ${login} not found`)
      const day = (date: string) => {
        let d = byDate.get(date)
        if (!d) byDate.set(date, (d = { date, contributions: 0, commits: 0, prs: 0, reviews: 0, issues: 0 }))
        return d
      }
      for (const w of c.contributionCalendar.weeks) for (const d of w.contributionDays) day(d.date).contributions = d.contributionCount
      for (const r of c.commitContributionsByRepository) for (const n of r.contributions.nodes) day(n.occurredAt.slice(0, 10)).commits += n.commitCount
      for (const n of c.pullRequestContributions.nodes) day(n.occurredAt.slice(0, 10)).prs++
      for (const n of c.pullRequestReviewContributions.nodes) day(n.occurredAt.slice(0, 10)).reviews++
      for (const n of c.issueContributions.nodes) day(n.occurredAt.slice(0, 10)).issues++
    }

    const today = now.toISOString().slice(0, 10)
    for (const d of byDate.values()) {
      if (!d.contributions && d.date !== today) continue
      // The id includes the counts, so a day re-syncs when it changes and is skipped when not.
      const hash = createHash('sha256').update(JSON.stringify(d)).digest('hex').slice(0, 12)
      await ctx.emit({ source: 'github', externalId: `${d.date}:${hash}`, at: now, body: d })
    }
    ctx.setCursor({ backfilled: true } satisfies Cursor)
  },
}
