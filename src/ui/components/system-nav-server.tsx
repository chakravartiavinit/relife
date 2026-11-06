import { connection } from 'next/server'
import { and, eq, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { getUser } from '@/core/user'
import { SystemNav } from './nav'

/** Setup links with the Inbox count (messages that need a look). */
export async function SystemNavWithCounts() {
  await connection()
  const user = await getUser()
  const [inbox] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.rawEvents)
    .where(and(eq(schema.rawEvents.userId, user.id), eq(schema.rawEvents.status, 'failed')))
  return <SystemNav badges={{ '/inbox': inbox.n }} />
}
