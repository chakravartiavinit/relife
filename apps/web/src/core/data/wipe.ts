import { rm } from 'node:fs/promises'
import { eq, sql as dsql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { forgetDevice } from '../auth/cache'
import { dataDir } from '../paths'
import { clearUserCache, getUser, type User } from '../user'
import { wipeGlobalTables } from './tables'

export const OWNER_WIPE_REFUSED = 'Remove the other people on this server first (Settings → People on this server). Deleting the owner’s data would leave them on a server with nobody to run it.'

/**
 * Delete everything of yours, and only yours: with several people on the server a wipe reaches no one else's rows. The
 * owner's wipe is refused while other people are on the server. The users row goes, and the database cascades through every table; the paired devices move
 * to a fresh row first, so nobody is signed out. A new id (not row-by-row deletes) means a sync that is still running
 * fails its next insert instead of writing data back. Kept on purpose: the devices, region, theme and the sign-in rule
 * (a wipe must never quietly turn "trust this Mac" back on), and `data/secret.key`: nothing it protects remains, and
 * deleting it would leave the worker holding a key the web app no longer has.
 */
export async function wipeUserData(user: User): Promise<void> {
  const moved: string[] = []
  let alone = true
  const uploads = (await db.select({ id: schema.imports.id }).from(schema.imports).where(eq(schema.imports.userId, user.id))).map((u) => u.id)
  await db.transaction(async (tx) => {
    // Locked: a concurrent insert for this user takes a KEY SHARE lock on the row and waits for us.
    const [old] = await tx.select().from(schema.users).where(eq(schema.users.id, user.id)).for('update')
    if (!old) throw new Error('Nothing to delete: this user is already gone.')
    const [{ n }] = await tx.select({ n: dsql<number>`count(*)::int` }).from(schema.users)
    alone = n === 1
    if (old.role === 'owner' && n > 1) throw new Error(OWNER_WIPE_REFUSED)
    await tx.update(schema.users).set({ email: null }).where(eq(schema.users.id, old.id)) // frees the unique email
    const { requireSignIn, prefs } = old.profile
    const [fresh] = await tx.insert(schema.users).values({
      // The owner's fresh start takes the name from .env as before; a member keeps theirs and their place on the server.
      name: old.role === 'owner' ? process.env.RELIFE_USER_NAME || 'Me' : old.name,
      role: old.role, timezone: old.timezone, baseCurrency: old.baseCurrency, email: old.email,
      profile: { ...(requireSignIn !== undefined && { requireSignIn }), ...(prefs && { prefs }) },
    }).returning({ id: schema.users.id })
    moved.push(...(await tx.update(schema.devices).set({ userId: fresh.id }).where(eq(schema.devices.userId, old.id)).returning({ id: schema.devices.id })).map((d) => d.id))
    await tx.delete(schema.users).where(eq(schema.users.id, old.id))
    // This person's job state (the new id starts clean) and replay keys. Global tables are emptied only when no one else is here.
    await tx.delete(schema.jobs).where(dsql`${schema.jobs.id} like ${'%@' + old.id}`)
    await tx.execute(dsql`delete from parties p where not exists (select 1 from party_members m where m.party_id = p.id and m.status <> 'left')`)
    for (const name of wipeGlobalTables()) {
      if (n === 1) await tx.execute(dsql`delete from ${dsql.identifier(name)}`)
      else if (name === 'idempotency') await tx.execute(dsql`delete from idempotency where device_id in (select id from devices where user_id = ${fresh.id})`)
    }
  })
  for (const id of moved) forgetDevice(id) // the cached device row still names the old person
  // Shop logins and cookies, library covers, and any uploaded import files still on disk. Public coin logos stay.
  // With other people on the server only this person's logins and uploads go: the folders are shared with them.
  if (alone) await Promise.all(['browser', 'library', 'imports'].map((d) => rm(dataDir(d), { recursive: true, force: true })))
  else {
    await Promise.all([rm(dataDir('browser', user.id), { recursive: true, force: true }), ...uploads.map((id) => rm(dataDir('imports', id), { recursive: true, force: true }))])
  }
  clearUserCache()
  await getUser() // creates nothing new: reads the fresh row and reloads the (now empty) key map
}
