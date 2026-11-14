import { rm } from 'node:fs/promises'
import { and, count, eq, isNull, like, max, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { forgetDevice } from './auth/cache'
import { dropUserKeys } from './env'
import { pendingRequests } from './auth/pairing'
import { clearUsersCache, hasMembers } from './multi-user'
import { dataDir } from './paths'
import { clearUserCache, type User } from './user'

// The people on one server (You › Settings › People on this server): who is here, and the owner removing someone. Everything
// here is the owner's; `requireOwner` is the one check.

export class NotOwnerError extends Error {
  constructor() { super('Only the person who runs this server can do that.') }
}

export function requireOwner(user: Pick<User, 'role'>) {
  if (user.role !== 'owner') throw new NotOwnerError()
}

export type Person = {
  id: string
  name: string
  role: 'owner' | 'member'
  devices: number
  lastSeenAt: Date | null
  joinedAt: Date
}

/** Everyone, oldest first (the owner leads), with how many devices they have and when one last reached the server. */
export async function listPeople(owner: User): Promise<Person[]> {
  requireOwner(owner)
  const rows = await db.select({
    id: schema.users.id, name: schema.users.name, role: schema.users.role, joinedAt: schema.users.createdAt,
    devices: count(schema.devices.id), lastSeenAt: max(schema.devices.lastSeenAt),
  }).from(schema.users)
    .leftJoin(schema.devices, and(eq(schema.devices.userId, schema.users.id), isNull(schema.devices.revokedAt), sql`coalesce(${schema.devices.meta}->>'legacy', '') <> 'true'`))
    .groupBy(schema.users.id).orderBy(schema.users.createdAt)
  return rows.map((r) => ({ ...r, lastSeenAt: r.lastSeenAt ? new Date(r.lastSeenAt) : null }))
}

/**
 * Remove a member for good: their row goes and the database cascades through everything they have (data, devices, keys, party
 * memberships). Their jobs' state, uploaded files and shop logins (`data/browser/<id>`) go too. The owner cannot be removed,
 * and nobody removes themselves here (a member's own wipe is in Settings → Data).
 */
export async function removePerson(owner: User, id: string): Promise<boolean> {
  requireOwner(owner)
  if (id === owner.id) throw new Error('You cannot remove yourself.')
  const [target] = await db.select().from(schema.users).where(eq(schema.users.id, id))
  if (!target) return false
  if (target.role === 'owner') throw new Error('The owner cannot be removed.')
  const devices = await db.select({ id: schema.devices.id }).from(schema.devices).where(eq(schema.devices.userId, id))
  const uploads = await db.select({ id: schema.imports.id }).from(schema.imports).where(eq(schema.imports.userId, id))
  await db.transaction(async (tx) => {
    await tx.delete(schema.users).where(eq(schema.users.id, id))
    await tx.delete(schema.jobs).where(like(schema.jobs.id, `%@${id}`))
    // A party nobody is left in has no one to see it.
    await tx.execute(sql`delete from parties p where not exists (select 1 from party_members m where m.party_id = p.id and m.status <> 'left')`)
  })
  for (const d of devices) forgetDevice(d.id)
  dropUserKeys(id)
  clearUsersCache()
  clearUserCache()
  await Promise.all([
    rm(dataDir('browser', id), { recursive: true, force: true }),
    ...uploads.map((u) => rm(dataDir('imports', u.id), { recursive: true, force: true })),
  ])
  return true
}

/**
 * Device requests belong to no one until approved, so with several people on a server only the owner sees the list: a member
 * would otherwise see (and could approve into their own account) a device someone else is setting up. A member still
 * approves their own device by the code it shows.
 */
export async function visibleRequests(viewer: Pick<User, 'role'>) {
  return viewer.role === 'owner' || !(await hasMembers()) ? pendingRequests() : []
}
