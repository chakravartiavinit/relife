import { and, eq } from 'drizzle-orm'
import { schema } from '@/db'
import type { Rule } from '@/core/types'
import { formatMoney } from '@/domain/money'

/** LOW_BALANCE_ALERT=5000 → alert when any bank account's latest balance is below ₹5,000. */
export const lowBalance: Rule = {
  id: 'low-balance',
  every: '0 */2 * * *',
  async check({ user, db }) {
    const limit = Number(process.env.LOW_BALANCE_ALERT)
    if (!limit) return []
    const accounts = await db.select().from(schema.accounts)
      .where(and(eq(schema.accounts.userId, user.id), eq(schema.accounts.kind, 'bank')))
    return accounts
      .filter((a) => a.latestBalance != null && a.latestBalance < limit)
      .map((a) => ({
        key: `low-balance:${a.id}`,
        title: `Low balance in ${a.name}`,
        body: `${formatMoney(a.latestBalance!, a.currency)} available, below your ${formatMoney(limit, a.currency)} alert.`,
        category: 'wealth' as const,
      }))
  },
}
