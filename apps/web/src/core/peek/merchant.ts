import { and, desc, eq, gte, isNull, or } from 'drizzle-orm'
import { db, schema } from '@/db'
import { SPEND_CATEGORIES } from '../categorize'
import { convert } from '../fx'
import { isSpend } from '../metrics'
import { addDays, localDate } from '../time'
import type { User } from '../user'
import { ruleFor, whenOf } from './txn'
import type { MerchantPeek } from './types'
import { monthLabel, shiftMonth } from '@/domain/wealth'

const MONTHS = 6

/**
 * Everything paid to one merchant (matched on the name, or on the UPI id when the payment has no name): this
 * month against the usual month, six months of bars, the last payments and the saved category rule.
 */
export async function loadMerchantPeek(user: User, name: string): Promise<MerchantPeek | null> {
  const today = localDate(new Date(), user.timezone)
  const month = today.slice(0, 7)
  const first = `${shiftMonth(month, -11)}-01`
  const T = schema.transactions
  const rows = await db.select().from(T)
    .where(and(eq(T.userId, user.id), or(eq(T.merchant, name), eq(T.upiId, name)), gte(T.localDate, first), isNull(T.linkedTo)))
    .orderBy(desc(T.at))
  if (!rows.length) return null
  const spend: ((typeof rows)[number] & { base: number })[] = []
  for (const r of rows) {
    const base = r.currency === user.baseCurrency ? r.amount : await convert(r.amount, r.currency, user.baseCurrency, r.localDate)
    const t = { ...r, base: base ?? 0 }
    if (isSpend(t)) spend.push(t)
  }
  const sum = (xs: typeof spend) => ({ total: xs.reduce((s, t) => s - t.base, 0), count: xs.length })
  const byMonth = new Map<string, number>()
  for (const t of spend) byMonth.set(t.localDate.slice(0, 7), (byMonth.get(t.localDate.slice(0, 7)) ?? 0) - t.base)
  const months = Array.from({ length: MONTHS }, (_, i) => shiftMonth(month, i - (MONTHS - 1)))
  const before = months.slice(0, -1).map((m) => byMonth.get(m) ?? 0).filter((v) => v > 0)
  const usual = before.length ? before.reduce((s, v) => s + v, 0) / before.length : null
  const thisMonth = byMonth.get(month) ?? 0
  const latest = rows[0]
  return {
    type: 'merchant',
    name,
    baseCurrency: user.baseCurrency,
    month,
    thisMonth: sum(spend.filter((t) => t.localDate.slice(0, 7) === month)),
    last30: sum(spend.filter((t) => t.localDate > addDays(today, -30))),
    last12: sum(spend),
    months: months.map((m) => ({ month: m, label: monthLabel(m).split(' ')[0].slice(0, 3), value: byMonth.get(m) ?? 0 })),
    usual,
    ratio: usual && thisMonth ? thisMonth / usual : null,
    category: latest.category,
    categories: [...SPEND_CATEGORIES],
    categoryTxnId: latest.id,
    rule: await ruleFor(user, latest.merchant, latest.upiId),
    latest: rows.slice(0, 10).map((r) => ({ id: r.id, when: whenOf(r.at, r.localDate, user.timezone), amount: r.amount, currency: r.currency })),
  }
}
