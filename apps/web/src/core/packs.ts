import type { Pack } from '@relife/contract'
import { and, eq, sql } from 'drizzle-orm'
import { schema } from '@/db'
import { MAX_ACTIVE, MAX_PENDING_DRAFTS, checkGoalDraft } from '@/domain/goals'
import { packGoalToRaw } from '@/domain/packs'
import { BUILT_IN_PACKS } from '@/packs'
import type { Tx } from './recovery'
import type { User } from './user'

/** The four starter packs (Fitness, Money, Student / Dev, Recovery), in the order setup shows them. */
export const builtInPacks = (): Pack[] => BUILT_IN_PACKS

export const packById = (id: string | null | undefined) => BUILT_IN_PACKS.find((p) => p.id === id)

/**
 * The pack's goal as a pending coach draft (kind `plan`, key `goal-draft:pack:<id>`), made inside setup's transaction.
 * It is a draft, not a goal: a goal needs a baseline the user doesn't have yet, so they type today's number when they
 * approve it on Plan › Goals or from Coach › Needs you. Nothing starts without a tap. Skipped when the draft already
 * exists, three drafts are waiting, three goals are active, or `checkGoalDraft` refuses it (it enforces the
 * sensitivity rules). Returns whether a draft was added.
 */
export async function insertPackGoalDraft(
  tx: Tx, user: User, packId: string, created: Map<string, string>, existing: Map<string, string>, today: string,
): Promise<boolean> {
  const pack = packById(packId)
  const goal = pack?.goals[0]
  if (!pack || !goal) return false
  const routineId = (key: string) => created.get(key) ?? existing.get(pack.routines.find((r) => r.key === key)?.name.toLowerCase() ?? '')
  const routines = pack.routines.flatMap((r) => { const id = routineId(r.key); return id ? [{ id, name: r.name, category: r.area }] : [] })
  const checked = checkGoalDraft(packGoalToRaw(goal, today, routineId), { today, trackers: [], routines })
  if (!checked.ok) return false
  const I = schema.insights
  const dedupeKey = `goal-draft:pack:${pack.id}`
  const [[dup], [{ pending }], [{ active }]] = await Promise.all([
    tx.select({ id: I.id }).from(I).where(and(eq(I.userId, user.id), sql`${I.payload}->>'dedupeKey' = ${dedupeKey}`)).limit(1).then((r) => [r[0]] as const),
    tx.select({ pending: sql<number>`count(*)::int` }).from(I).where(and(eq(I.userId, user.id), eq(I.status, 'pending'), sql`${I.payload} ? 'goalDraft'`)),
    tx.select({ active: sql<number>`count(*)::int` }).from(schema.goals).where(and(eq(schema.goals.userId, user.id), eq(schema.goals.status, 'active'))),
  ])
  if (dup || pending >= MAX_PENDING_DRAFTS || active >= MAX_ACTIVE) return false
  const draft = { ...checked.draft, origin: { pack: pack.id } }
  await tx.insert(I).values({
    userId: user.id, kind: 'plan', status: 'pending', title: `Goal draft: ${draft.title}`.slice(0, 140), body: draft.reason,
    payload: { goalDraft: draft, dedupeKey },
  })
  return true
}
