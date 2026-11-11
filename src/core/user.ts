import { asc } from 'drizzle-orm'
import { db, schema } from '@/db'

export type User = typeof schema.users.$inferSelect

// Single-user for now: the first user row is "me". Every table still carries user_id,
// so multi-user later means replacing this function with a session lookup.
let cached: User | undefined
export async function getUser(): Promise<User> {
  if (cached) return cached
  const [existing] = await db.select().from(schema.users).orderBy(asc(schema.users.createdAt)).limit(1)
  if (existing) {
    // Connected keys (saved in the Sources dialog) go into process.env before anything reads it.
    await (await import('./secrets')).applySecrets(existing.id)
    return (cached = existing)
  }
  const [created] = await db.insert(schema.users).values({
    name: process.env.RELIFE_USER_NAME || 'Me',
    timezone: process.env.RELIFE_TIMEZONE || 'Asia/Kolkata',
    baseCurrency: process.env.RELIFE_BASE_CURRENCY || 'INR',
  }).returning()
  await (await import('./secrets')).applySecrets(created.id)
  return (cached = created)
}

export function clearUserCache() { cached = undefined }
