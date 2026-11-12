import { asc, sql } from 'drizzle-orm'
import { db, schema } from '@/db'

export type User = typeof schema.users.$inferSelect

// Single-user for now: the first user row is "me". Every table still carries user_id,
// so multi-user later means replacing this function with a session lookup.
// One lookup in flight at a time: on a fresh database, the layout and the page call this together, and two
// parallel inserts would create two users and split the data between them.
let cached: Promise<User> | undefined
export function getUser(): Promise<User> {
  if (cached) return cached
  const p: Promise<User> = load().catch((e) => { if (cached === p) cached = undefined; throw e }) // retried next time
  return (cached = p)
}

async function load(): Promise<User> {
  // First run: the worker and the web app may both get here. A transaction lock lets only one create the user.
  const user = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('relife:create-user'))`)
    const [existing] = await tx.select().from(schema.users).orderBy(asc(schema.users.createdAt)).limit(1)
    return existing ?? (await tx.insert(schema.users).values({
      name: process.env.RELIFE_USER_NAME || 'Me',
      timezone: process.env.RELIFE_TIMEZONE || 'Asia/Kolkata',
      baseCurrency: process.env.RELIFE_BASE_CURRENCY || 'INR',
    }).returning())[0]
  })
  // Connected keys (saved in the Connectors dialog) go into the key map before anything reads it.
  await (await import('./secrets')).applySecrets(user.id)
  return user
}

export function clearUserCache() { cached = undefined }
