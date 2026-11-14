import { asc } from 'drizzle-orm'
import { db, schema } from '@/db'
import { setMulti } from './env'
import type { User } from './user'

// Who is on this server. One list, read at most every 5 seconds per process: the owner (the person who runs the server;
// `users.role`), the members, and whether `getUser()` may fall back to "the" user (only when there is exactly one).
// Tests that add people call `clearUsersCache()`.

const TTL_MS = 5_000
const g = globalThis as unknown as { __relifeUsersList?: { until: number; users: Promise<User[]> }; __relifeAiShared?: boolean }

/** Every person, oldest first. */
export function listUsers(now = Date.now()): Promise<User[]> {
  const hit = g.__relifeUsersList
  if (hit && hit.until > now) return hit.users
  const users = db.select().from(schema.users).orderBy(asc(schema.users.createdAt), asc(schema.users.id)).then((rows) => {
    setMulti(rows.length > 1)
    g.__relifeAiShared = pickOwner(rows)?.profile.instance?.shareAi !== false
    return rows
  })
  g.__relifeUsersList = { until: now + TTL_MS, users }
  users.catch(() => { if (g.__relifeUsersList?.users === users) g.__relifeUsersList = undefined })
  return users
}

export function clearUsersCache() {
  g.__relifeUsersList = undefined
}

/** The owner: the row with role `owner`, else the oldest (a database made before roles existed, or by a test). */
export const pickOwner = (users: User[]) => users.find((u) => u.role === 'owner') ?? users[0]

export const ownerUser = async () => pickOwner(await listUsers())
export const ownerId = async () => (await ownerUser())?.id ?? null
export const isOwner = (user: Pick<User, 'role'>) => user.role === 'owner'

/** People whose jobs run and whose devices work. */
export const activeUsers = async () => (await listUsers()).filter((u) => !u.disabledAt)

/** Loopback trust ("trust this Mac") belongs to a one-person server: with two people, anyone at the Mac would be the owner. */
export const hasMembers = async () => (await listUsers()).length > 1

// ── The owner's AI model, shared ─────────────────────────────────────────────────────────────────
// Members use the owner's model unless the owner turns that off (`users.profile.instance.shareAi`, default on). Usage is
// logged per person (`llm_runs.user_id`) and shown in Settings.

export const AI_OFF_MESSAGE = 'The person who runs this server turned off the AI model for everyone else.'

/** Whether this person may use the server's AI model. Sync: it reads the list `listUsers()` last loaded (at most 5 seconds old). */
export const aiAllowedSync = (user: Pick<User, 'role'>) => user.role === 'owner' || g.__relifeAiShared !== false

export async function aiAllowed(user: Pick<User, 'role'>) {
  if (user.role === 'owner') return true
  await listUsers()
  return aiAllowedSync(user)
}
