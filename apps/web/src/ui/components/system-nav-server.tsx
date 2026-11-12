import { connection } from 'next/server'
import { and, eq, isNull, notInArray, or, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { getUser } from '@/core/user'
import { WAITING_ERRORS } from '@/domain/inbox'
import { Nav, SystemNav } from './nav'

/** Setup links with the Inbox count: what needs you, not what is waiting to sort itself out. */
export async function SystemNavWithCounts() {
  await connection()
  const user = await getUser()
  const R = schema.rawEvents
  const [[unread], [uncategorized]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(R)
      .where(and(eq(R.userId, user.id), eq(R.status, 'failed'), or(isNull(R.error), notInArray(R.error, WAITING_ERRORS)))),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.transactions)
      .where(and(eq(schema.transactions.userId, user.id), eq(schema.transactions.category, 'Uncategorized'))),
  ])
  return <SystemNav badges={{ '/inbox': unread.n + uncategorized.n }} />
}

/** Main nav with the user's chosen areas. */
export async function NavForUser() {
  await connection()
  const user = await getUser()
  return <Nav areas={user.profile.areas} />
}
