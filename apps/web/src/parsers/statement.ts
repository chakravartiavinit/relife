import { cleanDescription } from '@/domain/statement'
import type { Parser } from '@/core/types'
import { asObj } from './util'

/**
 * One row of a bank or card statement CSV (core/imports/statement.ts). The merchant is the description with ids and
 * prefixes stripped, which `categorize()` matches on. `meta.importId` lets Undo remove the import; `linkStatements`
 * may later set `linked_to` when the row is the same payment as an app order.
 */
export const statement: Parser = {
  id: 'statement',
  match: (e) => e.source === 'statement',
  parse: (e) => {
    const b = asObj(e)
    const account = (b.account ?? {}) as { key?: string; name?: string; kind?: 'bank' | 'card' }
    const amount = Number(b.amount)
    if (!account.key || !account.name || !Number.isFinite(amount)) return []
    const description = String(b.description ?? '')
    return [{
      kind: 'transaction',
      account: { key: account.key, kind: account.kind === 'card' ? 'card' : 'bank', name: account.name, currency: typeof b.currency === 'string' ? b.currency : undefined },
      at: e.at,
      amount,
      currency: typeof b.currency === 'string' ? b.currency : 'INR',
      merchant: cleanDescription(description) || undefined,
      balance: typeof b.balance === 'number' ? b.balance : undefined,
      source: 'statement',
      externalRef: e.externalId,
      meta: { importId: b.importId, statement: true, description, ...(b.ref ? { ref: b.ref } : {}) },
    }]
  },
}
