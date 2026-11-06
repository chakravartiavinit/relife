import type { Parser } from '@/core/types'
import { gmail } from './util'

/**
 * Pre-debit / upcoming autopay notices. They announce a future debit, so they create no
 * transaction (the real debit alert does). Matching them here keeps them away from the LLM.
 * ponytail: could later auto-suggest a subscription schedule from these.
 */
export const mandateEmail: Parser = {
  id: 'mandate-email',
  match: (e) => {
    const g = gmail(e)
    return !!g && /pre-?debit|will be debited|scheduled to be debited|upcoming (?:debit|payment)/i.test(`${g.subject}\n${g.text}`)
  },
  parse: () => [],
}
