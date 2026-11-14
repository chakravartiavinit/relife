import { eq, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import type { UserProfile } from '@/db/schema'
import { hashToken } from './auth/tokens'
import { tokenOf } from './auth/trust'
import { scopedUser } from './context'
import { clearUsersCache, listUsers, pickOwner } from './multi-user'

export type User = typeof schema.users.$inferSelect

// "Who is signed in", for every one of the ~170 `getUser()` call sites. In order:
//   1. `runAs(user, fn)` (core/context.ts): the worker's per-person jobs, the Telegram bot, scripts, OAuth and ingest routes.
//   2. The request: the bearer token or session cookie of this request, looked up as a device, then its person.
//      Memoised per token for 5 seconds, so a page is about one query.
//   3. Neither: with exactly one person on the server, that person (scripts and a one-person install work as they always
//      did). With more than one it throws: it fails closed, never guessing who.
// A function behind `'use cache'` must take `userId` as an argument and never call this (AGENTS.md).

const TTL_MS = 5_000
type Memo = { user: Promise<User | null>; until: number }
const g = globalThis as unknown as {
  __relifeUserMemo?: Map<string, Memo>
  __relifeKeyLoads?: Map<string, { until: number; done: Promise<unknown> }>
  __relifeOwner?: Promise<User>
}
const memo = () => (g.__relifeUserMemo ??= new Map())
const keyLoads = () => (g.__relifeKeyLoads ??= new Map())

/** Saved connector keys go into the person's key map before anything reads it, at most every 5 seconds per person. */
async function withKeys(user: User, now = Date.now()): Promise<User> {
  const hit = keyLoads().get(user.id)
  if (hit && hit.until > now) { await hit.done; return user }
  const done = import('./secrets').then((m) => m.applySecrets(user.id))
  keyLoads().set(user.id, { until: now + TTL_MS, done })
  done.catch(() => keyLoads().delete(user.id)) // retried next time
  await done
  return user
}

/** The token this request carries, or undefined outside a request (the worker, a script, a test). */
async function requestToken(): Promise<string | undefined> {
  try {
    const { headers } = await import('next/headers')
    return tokenOf(await headers())?.token
  } catch {
    return undefined
  }
}

/** For tests: read request headers from here instead of Next's `headers()`. */
let headerSource: (() => Promise<string | undefined>) | undefined
export function setRequestTokenSource(fn: (() => Promise<string | undefined>) | undefined) { headerSource = fn }

/** The person behind a device token, or null (unknown, revoked, expired or disabled). Memoised for 5 seconds. */
export async function userForToken(token: string, now = Date.now()): Promise<User | null> {
  const key = hashToken(token).toString('hex')
  const hit = memo().get(key)
  if (hit && hit.until > now) return hit.user
  const user = (async () => {
    const { findByToken } = await import('./auth/devices')
    const found = await findByToken(token)
    if (!found.ok) return null
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, found.device.userId)).limit(1)
    return row && !row.disabledAt ? withKeys(row, now) : null
  })()
  memo().set(key, { user, until: now + TTL_MS })
  user.then((u) => { if (!u && memo().get(key)?.user === user) memo().delete(key) }, () => memo().delete(key)) // failures are never remembered
  return user
}

export async function getUser(): Promise<User> {
  const scoped = scopedUser()
  if (scoped) return scoped
  const token = await (headerSource ? headerSource() : requestToken())
  if (token) {
    const u = await userForToken(token)
    if (u) return u
  }
  const users = await listUsers()
  if (users.length === 1) return withKeys(users[0])
  if (users.length === 0) return ensureOwner()
  throw new Error('No signed-in user in this context')
}

/**
 * The owner, made on the first run. The worker and the web app may both get here on a fresh database: a transaction lock
 * lets only one create the row, and one lookup in flight at a time keeps the layout and the page from racing in one process.
 */
export function ensureOwner(): Promise<User> {
  if (g.__relifeOwner) return g.__relifeOwner
  const p: Promise<User> = load().catch((e) => { if (g.__relifeOwner === p) g.__relifeOwner = undefined; throw e }) // retried next time
  return (g.__relifeOwner = p)
}

async function load(): Promise<User> {
  const user = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('relife:create-user'))`)
    const all = await tx.select().from(schema.users).orderBy(schema.users.createdAt, schema.users.id)
    const existing = pickOwner(all)
    if (existing && existing.role === 'owner') return existing
    // A database from before roles existed (or made by `db:push`): its oldest person is the owner.
    if (existing) return (await tx.update(schema.users).set({ role: 'owner' }).where(eq(schema.users.id, existing.id)).returning())[0]
    return (await tx.insert(schema.users).values({
      name: process.env.RELIFE_USER_NAME || 'Me',
      timezone: process.env.RELIFE_TIMEZONE || 'Asia/Kolkata',
      baseCurrency: process.env.RELIFE_BASE_CURRENCY || 'INR',
      role: 'owner',
    }).returning())[0]
  })
  clearUsersCache()
  return withKeys(user)
}

/**
 * Loads the server's keys (AI, the Telegram bot, OAuth apps) and creates the owner on a fresh database, without asking
 * who is signed in: the edge gate and `authenticate()` call it before a device token is looked up, so the legacy
 * ACTIVITY_TOKEN and INGEST_TOKEN rows exist. It is the owner's keys it loads; a member's come with their own requests.
 */
export async function warmInstance(): Promise<void> {
  await ensureOwner()
  const owner = pickOwner(await listUsers())
  await withKeys(owner)
}

export function clearUserCache() {
  g.__relifeOwner = undefined
  g.__relifeUserMemo = undefined
  g.__relifeKeyLoads = undefined
  clearUsersCache()
}

/**
 * Change some profile keys without touching the rest: the database merges the patch into the saved profile (`||`), so
 * a concurrent write to another key (payments seen, celebrated level, theme) is never overwritten by a stale copy.
 * A key in the patch replaces that key whole; a key set to `undefined` is left as it is. Pass `tx` to join a transaction.
 */
export async function mergeProfile(userId: string, patch: Partial<UserProfile>, tx: Pick<typeof db, 'update'> = db) {
  await tx.update(schema.users).set({ profile: profileMerge(patch) }).where(eq(schema.users.id, userId))
  if (tx === db) clearUserCache()
}

/** The SQL value for `users.profile` that merges `patch` into the saved profile. */
export function profileMerge(patch: Partial<UserProfile>) {
  return sql`coalesce(${schema.users.profile}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`
}
