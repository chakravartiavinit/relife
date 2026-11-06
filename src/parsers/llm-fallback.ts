import type { Parser } from '@/core/types'
import { detectBank, hashRef } from './bank-text'
import { eventText } from './util'

const TEXT_SOURCES = new Set(['sms', 'ocr', 'gmail'])
const MONEY = /(?:₹|Rs\.?|INR|USD|\$)\s*\d/i
const MONEY_WORDS = /debit|credit|paid|spent|sent|received|refund|txn|transaction|purchase|payment/i

/**
 * Last resort for money-looking text no rule understood. Needs an LLM (LLM_PARSE or LLM_DEFAULT);
 * without one it records nothing, and the event shows as ignored in the Inbox.
 */
export const llmFallback: Parser = {
  id: 'llm-fallback',
  match: (e) => {
    if (!TEXT_SOURCES.has(e.source)) return false
    const t = eventText(e)
    return MONEY.test(t) && MONEY_WORDS.test(t) && !/\bOTP\b|one time password/i.test(t)
  },
  parse: async (e) => {
    // Loaded lazily so parsers (and their tests) never pull in AI SDKs unless needed.
    const { aiEnabled } = await import('@/ai')
    if (!aiEnabled('parse')) return []
    const { extractTransaction } = await import('@/ai/parse')
    const text = eventText(e)
    const x = await extractTransaction(text)
    if (!x || !x.amount) return []
    const bank = detectBank(text)
    const last4 = x.accountLast4 ?? 'xxxx'
    const at = x.at ? new Date(x.at) : e.at
    return [{
      kind: 'transaction',
      account: { key: `${bank.slug}:${last4}`, kind: 'bank', name: `${bank.name} ••${last4}`, institution: bank.name, currency: x.currency || 'INR' },
      at: Number.isNaN(at.getTime()) ? e.at : at,
      amount: x.direction === 'debit' ? -Math.abs(x.amount) : Math.abs(x.amount),
      currency: x.currency || 'INR',
      merchant: x.merchant, upiId: x.upiId, balance: x.balance,
      source: bank.slug,
      externalRef: x.ref ?? hashRef(x.amount, last4, at.toISOString().slice(0, 16)),
      meta: { parsedBy: 'llm' },
    }]
  },
}
