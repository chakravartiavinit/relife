import { connection } from 'next/server'
import { and, eq, isNull, notInArray, or, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { getUser } from '@/core/user'
import { WAITING_ERRORS } from '@/domain/inbox'
import { Nav, TabBar } from './nav'

/** What needs you: failed messages nobody can retry for you, plus payments waiting for a category. Not what sorts itself out. */
async function coachCount(userId: string) {
  const R = schema.rawEvents
  const [[unread], [uncategorized]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(R)
      .where(and(eq(R.userId, userId), eq(R.status, 'failed'), or(isNull(R.error), notInArray(R.error, WAITING_ERRORS)))),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.transactions)
      .where(and(eq(schema.transactions.userId, userId), eq(schema.transactions.category, 'Uncategorized'))),
  ])
  return unread.n + uncategorized.n
}

/** Main nav with the user's chosen areas and the Coach count. */
export async function NavForUser() {
  await connection()
  const user = await getUser()
  return <Nav areas={user.profile.areas} badges={{ '/coach': await coachCount(user.id) }} />
}

export async function TabBarForUser() {
  await connection()
  const user = await getUser()
  return <TabBar badges={{ '/coach': await coachCount(user.id) }} />
}
