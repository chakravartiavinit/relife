import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { getUser } from '@/core/user'
import { trackerDays } from '@/core/metrics'
import { addDays, formatDay, localDate } from '@/core/time'
import { weekGrid, fillDays } from '@/domain/series'
import { formatMoney, formatNumber } from '@/domain/money'
import { CATEGORY } from '@/ui/tokens'
import { Badge, Card, CardHeader, KpiStrip, PageHeader } from '@/ui/components/card'
import { Capsule } from '@/ui/components/capsule'
import { DailyBars } from '@/ui/components/charts'
import { EmptyState } from '@/ui/components/empty'
import { buttonClass } from '@/ui/components/button'
import { HeatCalendar } from '@/ui/beui/charts/heat-calendar'
import { RoutinesCard } from '@/ui/components/category/routines-card'
import { CategorySkeleton } from '@/ui/components/category/skeleton'
import { LearningActions, NewLearningButton } from '@/ui/components/forms/learning-forms'

export const metadata: Metadata = { title: 'Skills' }
const color = CATEGORY.skills.color

export default function SkillsPage() {
  return (
    <div>
      <PageHeader eyebrow="Skills" title="Code & learning" description="Code you ship and courses you take, with the hours each one gets." />
      <Suspense fallback={<CategorySkeleton />}>
        <Skills />
      </Suspense>
    </div>
  )
}

async function Skills() {
  await connection()
  const user = await getUser()
  const today = localDate(new Date(), user.timezone)
  const from = addDays(today, -89)
  const [data, items] = await Promise.all([
    trackerDays(user, from, today, { slugs: ['github.commits', 'github.prs', 'github.reviews', 'learning.minutes'] }),
    db.select().from(schema.learningItems).where(eq(schema.learningItems.userId, user.id))
      .orderBy(desc(schema.learningItems.updatedAt)),
  ])
  const get = (slug: string) => data.find((d) => d.tracker.slug === slug)?.days ?? new Map<string, number>()
  const sumLast = (m: Map<string, number>, n: number) => {
    const since = addDays(today, -(n - 1))
    let s = 0
    for (const [d, v] of m) if (d >= since) s += v
    return s
  }
  const commits = get('github.commits')
  const activeDays = [...commits.entries()].filter(([d, v]) => v > 0 && d >= addDays(today, -27)).length
  const learning = items.filter((i) => i.status !== 'done')
  const done = items.filter((i) => i.status === 'done')

  const grid = weekGrid(commits, today, 13)
  return (
    <div className="flex flex-col gap-6">
      <KpiStrip items={[
        { label: 'Commits, 28 days', value: formatNumber(sumLast(commits, 28)), sub: `${formatNumber(sumLast(commits, 7))} this week` },
        { label: 'Active days, 28 days', value: `${activeDays}/28` },
        { label: 'PRs and reviews, 28 days', value: formatNumber(sumLast(get('github.prs'), 28) + sumLast(get('github.reviews'), 28)), sub: `${formatNumber(sumLast(get('github.prs'), 28))} PRs · ${formatNumber(sumLast(get('github.reviews'), 28))} reviews` },
        { label: 'Learning, 28 days', value: `${formatNumber(sumLast(get('learning.minutes'), 28) / 60, 1)}h`, sub: `${learning.length} in progress` },
      ]} />
      <Card>
        <CardHeader title="GitHub" description="Last 90 days" />
        {commits.size ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
            <DailyBars data={fillDays(commits, from, today)} color={color} label="Commits per day, last 90 days" />
            <div role="group" aria-label="Commit activity, last 13 weeks">
              <HeatCalendar values={grid.values} maxCount={grid.max} weeks={13} endDate={new Date(`${today}T00:00:00Z`)} color={color} unit="commits" />
            </div>
          </div>
        ) : (
          <EmptyState title="GitHub isn’t connected yet" description="Connect it on the Connectors page. Commits, PRs and reviews sync every hour." action={<Link href="/connectors" className={buttonClass({ variant: 'primary', size: 'sm' })}>Open connectors</Link>} />
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Learning"
            description={`${formatNumber(sumLast(get('learning.minutes'), 28) / 60, 1)} h in the last 28 days`}
            action={<NewLearningButton />}
          />
          {learning.length ? (
            <ul className="-my-2 divide-y divide-divider">
              {learning.map((i) => {
                const hours = i.minutesLogged / 60
                return (
                  <li key={i.id} className="flex flex-col gap-3 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[15px] text-ink">
                          {i.url ? <a href={i.url} target="_blank" rel="noreferrer" className="hover:underline">{i.title}</a> : i.title}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-1.5 text-[13px] text-ink-3">
                          {i.provider ? <span>{i.provider}</span> : null}
                          <span className="tabular-nums">{formatNumber(hours, 1)} h logged</span>
                          {i.cost && i.currency ? (
                            <span className="tabular-nums">
                              · {formatMoney(i.cost, i.currency)}{hours >= 1 ? ` · ${formatMoney(i.cost / hours, i.currency)}/h` : ''}
                            </span>
                          ) : null}
                          {i.targetDate ? <span>· by {formatDay(i.targetDate)}</span> : null}
                        </div>
                      </div>
                      {i.status === 'paused' ? <Badge>Paused</Badge> : null}
                    </div>
                    {i.progressTotal ? (
                      <div className="flex items-center gap-3">
                        <Capsule value={i.progressDone} max={i.progressTotal} color={color} label={`${i.title} progress`} />
                        <span className="shrink-0 text-[12px] text-ink-3 tabular-nums">{i.progressDone}/{i.progressTotal}</span>
                      </div>
                    ) : null}
                    <LearningActions id={i.id} title={i.title} hasModules={!!i.progressTotal} />
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState title="Nothing in progress" description="Add a course, a cohort or a book. Log 15-minute chunks and see what each hour cost you." />
          )}
          {done.length ? <p className="mt-4 text-[13px] text-ink-3">{done.length} finished</p> : null}
        </Card>
        <RoutinesCard user={user} category="skills" />
      </div>
    </div>
  )
}
