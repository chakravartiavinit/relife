import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { ruleMatches } from '@/domain/merchant-rule'
import { SPEND_CATEGORIES } from '../categorize'
import { convert } from '../fx'
import { formatDay, formatTime } from '../time'
import type { User } from '../user'
import type { TxnPeek } from './types'

const UUID = /^[0-9a-f-]{36}$/i

/** The learned rule (merchant_rules) that matches a payment's merchant or UPI id. */
export async function ruleFor(user: User, merchant: string | null, upiId: string | null) {
  const hay = `${merchant ?? ''} ${upiId ?? ''}`.toLowerCase()
  const rules = await db.select().from(schema.merchantRules).where(eq(schema.merchantRules.userId, user.id))
  const hit = rules.find((r) => ruleMatches(hay, r.pattern)) // same matching as categorize, or the peek names a rule that never applied
  return hit ? { pattern: hit.pattern, category: hit.category } : null
}

export const whenOf = (at: Date, day: string, tz: string) => `${formatDay(day)} · ${formatTime(at, tz)}`

/** One payment: its category picker (with the remembered rule), the order's items when an app order has them. */
export async function loadTxnPeek(user: User, id: string): Promise<TxnPeek | null> {
  if (!UUID.test(id)) return null
  const T = schema.transactions
  const [t] = await db.select().from(T).where(and(eq(T.id, id), eq(T.userId, user.id)))
  if (!t) return null
  const [account, rule, base] = await Promise.all([
    t.accountId ? db.select({ name: schema.accounts.name }).from(schema.accounts).where(eq(schema.accounts.id, t.accountId)).then((r) => r[0]?.name ?? null) : Promise.resolve(null),
    ruleFor(user, t.merchant, t.upiId),
    convert(t.amount, t.currency, user.baseCurrency, t.localDate),
  ])
  const meta = (t.meta ?? {}) as { platform?: string; items?: { name?: string; qty?: number; price?: number }[] }
  return {
    type: 'txn',
    id: t.id,
    merchant: t.merchant,
    upiId: t.upiId,
    amount: t.amount,
    currency: t.currency,
    base: base ?? t.amount,
    baseCurrency: base == null ? t.currency : user.baseCurrency,
    when: whenOf(t.at, t.localDate, user.timezone),
    category: t.category,
    categories: [...SPEND_CATEGORIES],
    source: t.source,
    account,
    rule,
    platform: meta.platform ?? null,
    items: (Array.isArray(meta.items) ? meta.items : []).filter((i) => i?.name).map((i) => ({ name: i.name!, qty: i.qty || 1, price: i.price ?? null })),
  }
}
