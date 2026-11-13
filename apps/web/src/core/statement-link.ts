import { and, between, eq, isNull, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { matchStatementRows, type LinkOrder, type LinkRow } from '@/domain/statement-link'
import { addDays } from './time'
import type { User } from './user'

/**
 * Links bank rows to the app orders (or manual Capture spends) they paid: a statement row (money out, `linked_to` empty) that matches an app
 * order (`meta.appOrder`) on currency and amount within 2 days gets `linked_to` set to the order, and every spending
 * reader then counts the order only (`transactionsBetween`). Safe to run again; returns how many rows it linked.
 * It runs at the end of a statement import and in the parse job (an order can arrive after its bank row).
 */
export async function linkStatements(user: User, range: { from: string; to: string }): Promise<number> {
  const T = schema.transactions
  const from = addDays(range.from, -2), to = addDays(range.to, 2)
  const [rows, orders] = await Promise.all([
    db.select().from(T).where(and(eq(T.userId, user.id), eq(T.source, 'statement'), isNull(T.linkedTo), sql`${T.amount} < 0`, between(T.localDate, from, to))),
    db.select().from(T).where(and(eq(T.userId, user.id), sql`(${T.meta}->>'appOrder' = 'true' or ${T.source} = 'manual')`, sql`${T.amount} < 0`, between(T.localDate, from, to))),
  ])
  if (!rows.length || !orders.length) return 0
  // An order that is already linked to a row is taken.
  const taken = new Set((await db.select({ linkedTo: T.linkedTo }).from(T).where(and(eq(T.userId, user.id), sql`${T.linkedTo} is not null`))).map((r) => r.linkedTo))
  const linkRows: LinkRow[] = rows.map((r) => ({
    id: r.id, localDate: r.localDate, amount: r.amount, currency: r.currency,
    description: `${r.merchant ?? ''} ${(r.meta as { description?: string }).description ?? ''}`,
    rejected: Array.isArray((r.meta as { linkRejected?: unknown }).linkRejected) ? (r.meta as { linkRejected: string[] }).linkRejected : [],
  }))
  const linkOrders: LinkOrder[] = orders.filter((o) => !taken.has(o.id)).map((o) => ({
    id: o.id, localDate: o.localDate, amount: o.amount, currency: o.currency,
    platform: (o.meta as { platform?: string }).platform ?? o.merchant, // a manual spend: its note
  }))
  const links = matchStatementRows(linkRows, linkOrders)
  for (const l of links) await db.update(T).set({ linkedTo: l.orderId }).where(and(eq(T.id, l.rowId), isNull(T.linkedTo)))
  return links.length
}
