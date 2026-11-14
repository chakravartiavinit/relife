import { and, count, eq, gte, inArray, like, ne, or } from 'drizzle-orm'
import { PartyView, type PartyMemberView, type PartyShare } from '@relife/contract'
import { db, schema } from '@/db'
import { ACHIEVEMENTS } from '@/achievements'
import {
  cheerRef, cheerText, cleanShare, DEFAULT_PARTY_SHARE, daysBefore, factsNeeded, joinOrder, memberView, PARTY_MAX_MEMBERS, PARTY_MAX_PER_PERSON,
  isoWeek, partyChestRef, PARTY_QUEST, questState, type MemberFacts,
} from '@/domain/party'
import { rollChest, weekStart } from '@/domain/quests'
import { streaks } from '@/domain/streaks'
import { DEMO_MESSAGE, isDemo } from './demo'
import { buildDayPlan } from './day-plan'
import { activeDays } from './metrics'
import { listUsers } from './multi-user'
import { notify } from './outbox'
import { questBoard } from './quests'
import { addDays, localDate, localDayRange } from './time'
import type { User } from './user'
import { xpLevel } from './xp'

// Party mode (docs/FEATURES.md, Party). A few people on one server show each other a few numbers.
//
// This file is the ONE place that reads another person's data (the rest of the app is scoped to `getUser()`), and it does so
// only to build a `PartyView`: every member goes through `memberView` (domain/party.ts), which lets a field out only when that
// member ticked it, and only as a count, a percentage or a name. Values, health numbers, money, routine names, notes, goals,
// Coach and sources are never read here. A viewer who is not an active member gets nothing. Members are never ranked.

export class PartyError extends Error {}

const M = schema.partyMembers
const P = schema.parties

/** Party writes are off in the read-only demo, like every write. */
function writable() {
  if (isDemo()) throw new PartyError(DEMO_MESSAGE)
}

const NAME_MAX = 40
const cleanName = (raw: string) => {
  const name = raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
  if (!name) throw new PartyError('Give the party a name.')
  return name
}

// ── Reading ───────────────────────────────────────────────────────────────────────────────────────

/** The week now: its Monday, today, and how many days are already over (for "on track"). In the viewer's time zone. */
function weekOf(viewer: Pick<User, 'timezone'>, now: Date) {
  const today = localDate(now, viewer.timezone)
  return { today, monday: weekStart(today), before: daysBefore(today) }
}

type MemberRow = { id: string; userId: string; status: 'invited' | 'active'; share: PartyShare; joinedAt: Date | null; createdAt: Date }

async function membersOf(partyId: string): Promise<MemberRow[]> {
  const rows = await db.select({ id: M.id, userId: M.userId, status: M.status, share: M.share, joinedAt: M.joinedAt, createdAt: M.createdAt })
    .from(M).where(and(eq(M.partyId, partyId), inArray(M.status, ['invited', 'active'])))
  return rows as MemberRow[]
}

/** Show-up days of one person in a week, from their own check-offs and logs. A day a streak freeze covered is not one. */
async function showUpDays(person: User, from: string, to: string) {
  const days = await activeDays(person, from, { freezes: false })
  return [...days].filter((d) => d >= from && d <= to).length
}

/** The facts a member ticked, and no others. Each is the number the app already shows that person on their own pages. */
async function factsFor(person: User, share: PartyShare, now: Date, since: Date): Promise<{ facts: MemberFacts; days: number }> {
  const need = factsNeeded(share)
  const today = localDate(now, person.timezone)
  const personMonday = weekStart(today)
  const facts: MemberFacts = { name: person.name }
  // The week count is days they showed up; the streak is the one they see themselves, which a freeze keeps alive.
  const active = await activeDays(person, personMonday, { freezes: false })
  const days = [...active].filter((d) => d >= personMonday && d <= today).length
  if (need.streak) facts.streak = streaks(await activeDays(person, addDays(today, -400)), today).current
  const [level, plan, board, unlocked] = await Promise.all([
    need.level ? xpLevel(person) : null,
    need.today ? buildDayPlan(person, now) : null,
    need.quests ? questBoard(person, now) : null,
    need.achievements
      ? db.select({ key: schema.achievements.key }).from(schema.achievements)
        .where(and(eq(schema.achievements.userId, person.id), gte(schema.achievements.unlockedAt, since)))
      : null,
  ])
  if (level) facts.level = { level: level.level, title: level.title }
  if (plan) facts.today = { done: plan.done, total: plan.total }
  if (board) facts.quests = board.weekly.map((q) => Math.round((q.progress / Math.max(1, q.target)) * 100))
  if (unlocked) facts.achievements = unlocked.map((u) => ACHIEVEMENTS.find((a) => a.key === u.key)?.name).filter((n): n is string => !!n)
  return { facts, days }
}

/** Whether this person is an active member of the party. The gate every read passes first. */
async function activeMembership(viewer: Pick<User, 'id'>, partyId: string) {
  const [row] = await db.select({ id: M.id, share: M.share }).from(M)
    .where(and(eq(M.partyId, partyId), eq(M.userId, viewer.id), eq(M.status, 'active')))
  return row ?? null
}

/** The party as one active member sees it, or null for anyone else (no such party, not in it, only invited). */
export async function partyView(viewer: User, partyId: string, now = new Date()): Promise<PartyView | null> {
  if (!(await activeMembership(viewer, partyId))) return null
  const [party] = await db.select().from(P).where(eq(P.id, partyId))
  if (!party) return null
  const { monday, before } = weekOf(viewer, now)
  const [monday0] = localDayRange(monday, viewer.timezone)
  const rows = await membersOf(partyId)
  const people = new Map((await listUsers()).map((u) => [u.id, u]))
  const built = await Promise.all(rows.map(async (r) => {
    const person = people.get(r.userId)
    if (!person) return null
    const active = r.status === 'active'
    const { facts, days } = active ? await factsFor(person, r.share, now, monday0) : { facts: { name: person.name } as MemberFacts, days: 0 }
    const joined = (r.joinedAt ?? r.createdAt).toISOString()
    return {
      joined, id: r.id, active,
      fromStart: !!r.joinedAt && localDate(r.joinedAt, viewer.timezone) < monday,
      days,
      view: memberView({ id: r.id, you: r.userId === viewer.id, status: r.status, share: r.share, facts, days, before }),
    }
  }))
  const members = joinOrder(built.filter((m) => !!m))
  const quest = questState(members.filter((m) => m.active).map((m) => ({ days: m.days, fromStart: m.fromStart })), before)
  // Parsed through the contract: anything the allow-list did not name cannot get out. One party that does not fit it is
  // logged and left out, so it cannot take the whole Progress page down.
  const parsed = PartyView.safeParse({
    id: party.id, name: party.name, week: monday,
    quest: { title: PARTY_QUEST.title, target: PARTY_QUEST.target, ...quest },
    members: members.map((m) => m.view),
  })
  if (!parsed.success) {
    console.error(`[party] ${party.id} does not match the contract and is hidden:`, parsed.error.issues.map((i) => i.path.join('.')).join(', '))
    return null
  }
  return parsed.data
}

export type PartyInvite = { partyId: string; party: string; from: string | null; members: number; at: string }
export type PartyPerson = { id: string; name: string }

/** Parties the viewer has been asked to join (for Needs you and the card). Only the party's name and who asked. */
export async function partyInvites(viewer: Pick<User, 'id'>): Promise<PartyInvite[]> {
  const rows = await db.select({ partyId: M.partyId, party: P.name, invitedBy: M.invitedBy, at: M.createdAt }).from(M)
    .innerJoin(P, eq(P.id, M.partyId)).where(and(eq(M.userId, viewer.id), eq(M.status, 'invited'))).orderBy(M.createdAt)
  if (!rows.length) return []
  const people = new Map((await listUsers()).map((u) => [u.id, u.name]))
  const sizes = await db.select({ partyId: M.partyId, n: count() }).from(M)
    .where(and(inArray(M.partyId, rows.map((r) => r.partyId)), eq(M.status, 'active'))).groupBy(M.partyId)
  return rows.map((r) => ({ partyId: r.partyId, party: r.party, from: r.invitedBy ? people.get(r.invitedBy) ?? null : null, members: sizes.find((s) => s.partyId === r.partyId)?.n ?? 0, at: r.at.toISOString() }))
}

/** Everyone else on the server who can be asked: their name and nothing more. Names are not private on a shared server. */
export async function partyPeople(viewer: Pick<User, 'id'>): Promise<PartyPerson[]> {
  return (await listUsers()).filter((u) => u.id !== viewer.id && !u.disabledAt).map((u) => ({ id: u.id, name: u.name }))
}

/** A party and who the viewer could still ask into it (people on the server who are not in it or already asked). */
export type PartyEntry = { view: PartyView; invitable: PartyPerson[] }
export type PartyCard = { parties: PartyEntry[]; invites: PartyInvite[]; people: PartyPerson[]; full: boolean }

/** Everything the Party card needs. Parties first by when the viewer joined; no scores anywhere. */
export async function partyCard(viewer: User, now = new Date()): Promise<PartyCard> {
  const mine = await db.select({ partyId: M.partyId }).from(M).where(and(eq(M.userId, viewer.id), eq(M.status, 'active'))).orderBy(M.joinedAt)
  const [views, invites, people] = await Promise.all([
    Promise.all(mine.map((m) => partyView(viewer, m.partyId, now))),
    partyInvites(viewer),
    partyPeople(viewer),
  ])
  const parties: PartyEntry[] = []
  for (const [i, view] of views.entries()) {
    if (!view) continue
    const inside = new Set((await membersOf(mine[i].partyId)).map((r) => r.userId))
    parties.push({ view, invitable: view.members.length >= PARTY_MAX_MEMBERS ? [] : people.filter((p) => !inside.has(p.id)) })
  }
  return { parties, invites, people, full: mine.length >= PARTY_MAX_PER_PERSON }
}

// ── Writing: always the viewer's own rows ───────────────────────────────────────────────────────────

async function validPeople(viewer: Pick<User, 'id'>, ids: string[]) {
  const ok = new Set((await partyPeople(viewer)).map((p) => p.id))
  const unique = [...new Set(ids)]
  if (unique.some((id) => !ok.has(id))) throw new PartyError('Pick people who are on this server.')
  return unique
}

/**
 * Locks one row for the rest of the transaction, so a count read after it cannot be changed by someone else's write before this
 * one lands: the person's row guards "3 parties each", the party's row guards "8 people in a party". `no key update`: other
 * tables' foreign-key inserts for the same row (a check, an entry) are not held up.
 */
const lockUser = (tx: Pick<typeof db, 'select'>, userId: string) => tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, userId)).for('no key update')
const lockParty = (tx: Pick<typeof db, 'select'>, partyId: string) => tx.select({ id: P.id }).from(P).where(eq(P.id, partyId)).for('no key update')

const countActive = async (tx: Pick<typeof db, 'select'>, where: ReturnType<typeof eq>) => (await tx.select({ n: count() }).from(M).where(and(where, eq(M.status, 'active'))))[0].n
const TOO_MANY = `You are in ${PARTY_MAX_PER_PERSON} parties already. Leave one first.`

/** Start a party and ask people on this server. The starter is in at once with the share they choose. */
export async function createParty(viewer: User, input: { name: string; invite: string[]; share?: unknown }) {
  writable()
  const name = cleanName(input.name)
  const invite = await validPeople(viewer, input.invite)
  if (invite.length > PARTY_MAX_MEMBERS - 1) throw new PartyError(`A party holds up to ${PARTY_MAX_MEMBERS} people.`)
  return db.transaction(async (tx) => {
    await lockUser(tx, viewer.id)
    if ((await countActive(tx, eq(M.userId, viewer.id))) >= PARTY_MAX_PER_PERSON) throw new PartyError(TOO_MANY)
    const [party] = await tx.insert(P).values({ name, createdBy: viewer.id }).returning()
    await tx.insert(M).values({ partyId: party.id, userId: viewer.id, status: 'active', share: input.share ? cleanShare(input.share) : DEFAULT_PARTY_SHARE, joinedAt: new Date(), invitedBy: viewer.id })
    if (invite.length) await tx.insert(M).values(invite.map((userId) => ({ partyId: party.id, userId, status: 'invited' as const, invitedBy: viewer.id })))
    return party.id
  })
}

/** An active member asks one more person. A person who left or declined can be asked again. */
export async function inviteToParty(viewer: User, partyId: string, userId: string) {
  writable()
  const [id] = await validPeople(viewer, [userId])
  await db.transaction(async (tx) => {
    if (!(await lockParty(tx, partyId)).length) throw new PartyError('You are not in that party.')
    const [me] = await tx.select({ id: M.id }).from(M).where(and(eq(M.partyId, partyId), eq(M.userId, viewer.id), eq(M.status, 'active')))
    if (!me) throw new PartyError('You are not in that party.')
    const rows = await tx.select({ userId: M.userId }).from(M).where(and(eq(M.partyId, partyId), inArray(M.status, ['invited', 'active'])))
    if (rows.some((r) => r.userId === id)) throw new PartyError('They are already in, or already asked.')
    if (rows.length >= PARTY_MAX_MEMBERS) throw new PartyError(`A party holds up to ${PARTY_MAX_MEMBERS} people.`)
    // Only a row that left is asked again; an active or already asked one is never rewritten.
    const asked = await tx.insert(M).values({ partyId, userId: id, status: 'invited', invitedBy: viewer.id, share: DEFAULT_PARTY_SHARE })
      .onConflictDoUpdate({ target: [M.partyId, M.userId], set: { status: 'invited', invitedBy: viewer.id, joinedAt: null, share: DEFAULT_PARTY_SHARE, updatedAt: new Date() }, setWhere: eq(M.status, 'left') })
      .returning({ id: M.id })
    if (!asked.length) throw new PartyError('They are already in, or already asked.')
  })
}

/** Accept (with what to share) or decline an invitation. Only the invited person can answer their own. */
export async function answerInvite(viewer: User, partyId: string, accept: boolean, share?: unknown) {
  writable()
  const gone = new PartyError('That invitation is gone.')
  if (!accept) {
    const out = await db.delete(M).where(and(eq(M.partyId, partyId), eq(M.userId, viewer.id), eq(M.status, 'invited'))).returning({ id: M.id })
    if (!out.length) throw gone
    return
  }
  await db.transaction(async (tx) => {
    await lockUser(tx, viewer.id)
    if (!(await lockParty(tx, partyId)).length) throw gone
    const [row] = await tx.select({ id: M.id }).from(M).where(and(eq(M.partyId, partyId), eq(M.userId, viewer.id), eq(M.status, 'invited')))
    if (!row) throw gone
    if ((await countActive(tx, eq(M.userId, viewer.id))) >= PARTY_MAX_PER_PERSON) throw new PartyError(TOO_MANY)
    const n = await countActive(tx, eq(M.partyId, partyId))
    // Nobody left to join: the party is over (it goes with its last member's leaving; this is the asked-after-that case).
    if (n === 0) throw new PartyError('That party has ended: everyone in it has left.')
    if (n >= PARTY_MAX_MEMBERS) throw new PartyError('That party is full.')
    const joined = await tx.update(M).set({ status: 'active', joinedAt: new Date(), share: share ? cleanShare(share) : DEFAULT_PARTY_SHARE, updatedAt: new Date() })
      .where(and(eq(M.id, row.id), eq(M.status, 'invited'))).returning({ id: M.id })
    if (!joined.length) throw gone
  })
}

/** Leave: your row goes quiet at once, and a party nobody is left in is deleted. */
export async function leaveParty(viewer: User, partyId: string) {
  writable()
  await db.transaction(async (tx) => {
    await lockParty(tx, partyId)
    const left = await tx.update(M).set({ status: 'left', share: DEFAULT_PARTY_SHARE, updatedAt: new Date() })
      .where(and(eq(M.partyId, partyId), eq(M.userId, viewer.id), eq(M.status, 'active'))).returning({ id: M.id })
    if (!left.length) throw new PartyError('You are not in that party.')
    if ((await countActive(tx, eq(M.partyId, partyId))) === 0) await tx.delete(P).where(eq(P.id, partyId))
  })
}

/** "Change what I share": the viewer's own row, at any time. */
export async function setShare(viewer: User, partyId: string, share: unknown) {
  writable()
  const set = await db.update(M).set({ share: cleanShare(share), updatedAt: new Date() })
    .where(and(eq(M.partyId, partyId), eq(M.userId, viewer.id), eq(M.status, 'active'))).returning({ id: M.id })
  if (!set.length) throw new PartyError('You are not in that party.')
}

/**
 * A nudge for one member (by their membership id in the view, never a user id): "<name> cheered you on". One a day per pair;
 * it goes through the outbox as a message to them, so their quiet hours and caps apply. A cheerer who hides their name is
 * "Someone". `queued` is false when they have nowhere to receive it (no Telegram, no phone): nothing was saved, and the
 * card says so instead of "Cheer sent".
 */
export async function cheer(viewer: User, memberId: string, now = new Date()): Promise<{ queued: boolean }> {
  writable()
  const [target] = await db.select({ userId: M.userId, partyId: M.partyId, party: P.name }).from(M).innerJoin(P, eq(P.id, M.partyId))
    .where(and(eq(M.id, memberId), eq(M.status, 'active'), ne(M.userId, viewer.id)))
  const me = target ? await activeMembership(viewer, target.partyId) : null
  if (!target || !me) throw new PartyError('You can only cheer people in your own parties.')
  const friend = (await listUsers()).find((u) => u.id === target.userId)
  if (!friend) throw new PartyError('They are no longer on this server.')
  const ref = cheerRef(viewer.id, friend.id, localDate(now, friend.timezone))
  const [done] = await db.select({ id: schema.notifications.id }).from(schema.notifications)
    .where(and(eq(schema.notifications.userId, friend.id), eq(schema.notifications.ref, ref))).limit(1)
  if (done) throw new PartyError('You already cheered them today.')
  return { queued: await notify(friend, 'events', { text: cheerText(me.share.name ? viewer.name : null, target.party), ref }) }
}

// ── The party chest ───────────────────────────────────────────────────────────────────────────────

/**
 * The viewer's own chest for a party week that was cleared (this week and last): every counted member showed up on 5 of 7 days.
 * A normal `rare` chest in the viewer's own chests with ref `party:<isoWeek>`: at most one per person per week however many parties
 * they are in (the ref is unique per person, so it is paid once however often, or however concurrently, this runs). Paying it is
 * the existing chest flow: XP of kind `bonus`, never `standard`. Returns how many are new.
 */
export async function awardPartyChests(user: User, now = new Date()) {
  const mine = await db.select({ partyId: M.partyId, name: P.name, joinedAt: M.joinedAt }).from(M).innerJoin(P, eq(P.id, M.partyId))
    .where(and(eq(M.userId, user.id), eq(M.status, 'active'))).orderBy(M.joinedAt)
  if (!mine.length) return 0
  const { monday } = weekOf(user, now)
  let fresh = 0
  for (const start of [monday, addDays(monday, -7)]) {
    const ref = partyChestRef(start)
    // Paid for this week already, here or (an earlier build) under a per-party ref.
    const [have] = await db.select({ id: schema.chests.id }).from(schema.chests)
      .where(and(eq(schema.chests.userId, user.id), or(eq(schema.chests.ref, ref), like(schema.chests.ref, `party:%:${isoWeek(start)}`))))
    if (have) continue
    for (const party of mine) {
      // Joined before the week began, by the person's own calendar.
      if (!party.joinedAt || localDate(party.joinedAt, user.timezone) >= start) continue
      if (!(await clearedWeek(user, party.partyId, start))) continue
      const roll = rollChest('rare', ref)
      const [row] = await db.insert(schema.chests).values({ userId: user.id, rarity: 'rare', ref, xp: roll.xp, freeze: roll.freeze, reason: `Party quest: ${party.name}` })
        .onConflictDoNothing().returning({ id: schema.chests.id })
      if (row) fresh++
      break // one a week, whichever party cleared first
    }
  }
  return fresh
}

/** Whether every counted member of a party showed up on enough days in the week that starts on `start` (the viewer's calendar). */
async function clearedWeek(viewer: Pick<User, 'timezone'>, partyId: string, start: string) {
  const rows = (await membersOf(partyId)).filter((r) => r.status === 'active')
  const people = new Map((await listUsers()).map((u) => [u.id, u]))
  const members = await Promise.all(rows.map(async (r) => {
    const person = people.get(r.userId)
    return { days: person ? await showUpDays(person, start, addDays(start, 6)) : 0, fromStart: !!r.joinedAt && localDate(r.joinedAt, viewer.timezone) < start }
  }))
  return questState(members, 7).cleared
}
