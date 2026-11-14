// Adds two more people, devices and a party to the mock database, for screenshots and trying Settings → People and Party
// by hand. Run after `npm run mock:seed`; `mock:seed` resets it. Never touches a real database (mock only).
//
//   RELIFE_MOCK=1 tsx --env-file=../../.env scripts/mock-people.ts          prints a session token per person
import { writeFileSync } from 'node:fs'
import { eq, sql as dsql } from 'drizzle-orm'
import { db, isMock, schema, sql } from '@/db'
import { createDevice } from '@/core/auth/devices'
import { createInvite } from '@/core/auth/pairing'
import { addDays, localDate } from '@/core/time'
import { ensureOwner } from '@/core/user'

async function main() {
  if (!isMock) throw new Error('mock-people runs on the mock database only: set RELIFE_MOCK=1')
  const owner = await ensureOwner()
  await db.delete(schema.parties)
  await db.delete(schema.users).where(dsql`${schema.users.role} = 'member'`)
  const member = async (name: string, days: number) => {
    const [u] = await db.insert(schema.users).values({ name, role: 'member', timezone: owner.timezone, baseCurrency: owner.baseCurrency, profile: { onboardedAt: new Date().toISOString() } }).returning()
    const [s] = await db.insert(schema.schedules).values({ userId: u.id, name: 'Morning walk', kind: 'routine', category: 'health', rrule: 'DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY' }).returning()
    const today = localDate(new Date(), owner.timezone)
    for (let i = 0; i < days; i++) {
      const d = addDays(today, -i)
      await db.insert(schema.checks).values({ scheduleId: s.id, occurrence: new Date(`${d}T03:30:00Z`), localDate: d, status: 'done' }).onConflictDoNothing()
    }
    const { token } = await createDevice({ userId: u.id, kind: 'browser', name: `${name}’s phone`, scopes: ['full'] })
    return { user: u, token }
  }
  const priya = await member('Priya', 6)
  const sam = await member('Sam', 1)
  const jo = await member('Jo', 0)
  const owned = await createDevice({ userId: owner.id, kind: 'browser', name: 'Mac · Safari', scopes: ['full'] })
  await createInvite({ ownerId: owner.id, deviceId: owned.device.id, baseUrl: 'http://192.168.1.20:3030' })
  const [expired] = await db.insert(schema.pairings).values({ userId: null, method: 'invite', secretHash: Buffer.from('mock-expired'), scopes: ['full'], meta: { invitedBy: owner.id }, expiresAt: new Date(Date.now() - 86_400_000) }).returning()
  void expired

  const share = (o: Partial<Record<'name' | 'level' | 'streak' | 'today' | 'quests' | 'achievements', boolean>>) => ({ name: false, level: false, streak: false, today: false, quests: false, achievements: false, ...o })
  const [crew] = await db.insert(schema.parties).values({ name: 'Morning crew', createdBy: owner.id }).returning()
  const joined = new Date(Date.now() - 20 * 86_400_000)
  await db.insert(schema.partyMembers).values([
    { partyId: crew.id, userId: owner.id, status: 'active', joinedAt: joined, invitedBy: owner.id, share: share({ name: true, level: true, streak: true, today: true, quests: true, achievements: true }) },
    { partyId: crew.id, userId: priya.user.id, status: 'active', joinedAt: new Date(joined.getTime() + 3600_000), invitedBy: owner.id, share: share({ name: true, level: true, streak: true, today: true }) },
    { partyId: crew.id, userId: sam.user.id, status: 'active', joinedAt: new Date(joined.getTime() + 7200_000), invitedBy: owner.id, share: share({}) },
    { partyId: crew.id, userId: jo.user.id, status: 'invited', invitedBy: owner.id, share: share({ name: true, level: true }) },
  ])
  const [walkers] = await db.insert(schema.parties).values({ name: 'Sunday walkers', createdBy: priya.user.id }).returning()
  await db.insert(schema.partyMembers).values([
    { partyId: walkers.id, userId: priya.user.id, status: 'active', joinedAt: joined, invitedBy: priya.user.id, share: share({ name: true, level: true }) },
    { partyId: walkers.id, userId: sam.user.id, status: 'active', joinedAt: joined, invitedBy: priya.user.id, share: share({ name: true }) },
    { partyId: walkers.id, userId: owner.id, status: 'invited', invitedBy: priya.user.id },
  ])
  await db.update(schema.users).set({ profile: dsql`${schema.users.profile} || '{"instance":{"shareAi":true}}'::jsonb` }).where(eq(schema.users.id, owner.id))
  writeFileSync('/tmp/p5b/tokens.json', JSON.stringify({ owner: owned.token, priya: priya.token, sam: sam.token }))
  console.log('mock people ready: Priya, Sam, Jo, a party and an invitation (tokens in /tmp/p5b/tokens.json)')
  await sql.end()
}

main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
