import { cache } from 'react'
import { connection } from 'next/server'
import { and, eq, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { getUser } from '@/core/user'
import { inboxCount } from '@/core/inbox'
import { todayLeft } from '@/core/schedules'
import { railXp } from './rail-data'
import type { Category } from '@/db/schema'
import { Nav, TabBar } from './nav'
import type { NavCounts } from '../nav-model'

/** The rail and the tab bar read the same numbers; React's per-request cache runs the queries once for both. */
const navData = cache(async () => {
  await connection()
  const user = await getUser()
  // A count that fails to load leaves its row plain: the nav must never take the page down with it.
  const safe = <T,>(p: Promise<T>, what: string) => p.catch((e) => { console.error(`nav: ${what} failed`, e); return undefined })
  const [sources, nudges, today, rail] = await Promise.all([
    safe(inboxCount(user), 'sources count'),
    safe(db.select({ n: sql<number>`count(*)::int` }).from(schema.insights).where(and(eq(schema.insights.userId, user.id), eq(schema.insights.status, 'pending'))).then(([r]) => r.n), 'nudges count'),
    safe(todayLeft(user), 'today count'),
    safe(railXp(), 'levels'),
  ])
  const levels = rail ? (Object.fromEntries(rail.xp.areas.map((a) => [a.area, a.level])) as Partial<Record<Category, number>>) : undefined
  const counts: NavCounts = { sources, nudges, today, levels }
  return { counts, areas: user.profile.areas }
})

/** The rail: Play, Stats (the areas the user picked), Sources and Settings, with live counts. */
export async function NavForUser() {
  const { counts, areas } = await navData()
  return <Nav counts={counts} areas={areas} />
}

/** The phone tab bar, with the same counts. */
export async function TabBarForUser() {
  const { counts, areas } = await navData()
  return <TabBar counts={counts} areas={areas} />
}
