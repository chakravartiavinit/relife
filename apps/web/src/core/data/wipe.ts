import { rm } from 'node:fs/promises'
import { eq, sql as dsql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { dataDir } from '../paths'
import { clearUserCache, getUser, type User } from '../user'
import { wipeGlobalTables } from './tables'

/** What the Delete button types back to the server. */
export const WIPE_CONFIRM = 'delete-everything'

/**
 * Delete everything of yours. The users row goes, and the database cascades through every table; the paired devices move
 * to a fresh row first, so nobody is signed out. A new id (not row-by-row deletes) means a sync that is still running
 * fails its next insert instead of writing data back. Kept on purpose: the devices, region, theme and the sign-in rule
 * (a wipe must never quietly turn "trust this Mac" back on), and `data/secret.key`: nothing it protects remains, and
 * deleting it would leave the worker holding a key the web app no longer has.
 */
export async function wipeUserData(user: User): Promise<void> {
  await db.transaction(async (tx) => {
    // Locked: a concurrent insert for this user takes a KEY SHARE lock on the row and waits for us.
    const [old] = await tx.select().from(schema.users).where(eq(schema.users.id, user.id)).for('update')
    if (!old) throw new Error('Nothing to delete: this user is already gone.')
    await tx.update(schema.users).set({ email: null }).where(eq(schema.users.id, old.id)) // frees the unique email
    const { requireSignIn, prefs } = old.profile
    const [fresh] = await tx.insert(schema.users).values({
      name: process.env.RELIFE_USER_NAME || 'Me',
      timezone: old.timezone, baseCurrency: old.baseCurrency, email: old.email,
      profile: { ...(requireSignIn !== undefined && { requireSignIn }), ...(prefs && { prefs }) },
    }).returning({ id: schema.users.id })
    await tx.update(schema.devices).set({ userId: fresh.id }).where(eq(schema.devices.userId, old.id))
    await tx.delete(schema.users).where(eq(schema.users.id, old.id))
    for (const name of wipeGlobalTables()) await tx.execute(dsql`delete from ${dsql.identifier(name)}`)
  })
  // Shop logins and cookies, and library covers. Public coin logos stay.
  await Promise.all(['browser', 'library'].map((d) => rm(dataDir(d), { recursive: true, force: true })))
  clearUserCache()
  await getUser() // creates nothing new: reads the fresh row and reloads the (now empty) key map
}
