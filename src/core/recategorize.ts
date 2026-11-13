import { and, eq, inArray, or, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import type { User } from './user'

/**
 * What `undoRecategorizeTxns` needs to put things back: each payment that changed with the category it had, the
 * category it was given, and the rule that was written (with the category it had before, or null when it was new).
 */
export type RecategorizeUndo = { moved: { id: string; from: string | null }[]; to: string; pattern: string | null; prevRule?: string | null }

/**
 * Re-categorize a payment and, with `remember`, write the rule for that merchant / UPI id and move every other payment
 * from it too. Records each payment it changes with its old category, so Undo restores all of them, not only the
 * ones that were waiting.
 */
export async function recategorizeTxns(user: User, transactionId: string, category: string, remember: boolean): Promise<RecategorizeUndo> {
  const t = schema.transactions
  const undo: RecategorizeUndo = { moved: [], to: category, pattern: null }
  const [before] = await db.select().from(t).where(and(eq(t.id, transactionId), eq(t.userId, user.id)))
  if (!before) return undo
  const pattern = (before.upiId ?? before.merchant ?? '').toLowerCase().trim()
  const same = before.upiId ? eq(t.upiId, before.upiId) : eq(t.merchant, before.merchant ?? '')
  const all = remember && pattern
  const moved = await db.select({ id: t.id, from: t.category }).from(t)
    .where(and(eq(t.userId, user.id), all ? or(eq(t.id, before.id), same) : eq(t.id, before.id), sql`${t.category} is distinct from ${category}`))
  undo.moved = moved
  if (moved.length) await db.update(t).set({ category }).where(and(eq(t.userId, user.id), inArray(t.id, moved.map((m) => m.id))))
  if (all) {
    const r = schema.merchantRules
    const [prev] = await db.select({ category: r.category }).from(r).where(and(eq(r.userId, user.id), eq(r.pattern, pattern)))
    undo.prevRule = prev?.category ?? null
    await db.insert(r).values({ userId: user.id, pattern, merchant: before.merchant ?? pattern, category })
      .onConflictDoUpdate({ target: [r.userId, r.pattern], set: { category } })
    undo.pattern = pattern
  }
  return undo
}

/**
 * Undo a `recategorizeTxns`: the rule goes back to what it was (or goes), and every payment it moved gets its old
 * category back. A payment changed again since then keeps the newer category, so repeating Undo is safe.
 */
export async function undoRecategorizeTxns(user: User, undo: RecategorizeUndo) {
  const r = schema.merchantRules
  const rule = and(eq(r.userId, user.id), eq(r.pattern, undo.pattern ?? ''))
  if (undo.pattern && undo.prevRule) await db.update(r).set({ category: undo.prevRule }).where(rule)
  else if (undo.pattern) await db.delete(r).where(rule)
  const t = schema.transactions
  for (const from of new Set(undo.moved.map((m) => m.from))) {
    const ids = undo.moved.filter((m) => m.from === from).map((m) => m.id)
    await db.update(t).set({ category: from }).where(and(eq(t.userId, user.id), eq(t.category, undo.to), inArray(t.id, ids)))
  }
}
