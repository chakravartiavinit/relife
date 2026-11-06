import type { Parser } from '@/core/types'
import { bankTextToRecs, isBankText } from './bank-text'
import { BANK_SENDER, gmail } from './util'

/** Bank alert emails (Axis etc). Same text rules as SMS; same ref, so SMS + email dedupe. */
export const bankEmail: Parser = {
  id: 'bank-email',
  match: (e) => {
    const g = gmail(e)
    return !!g && BANK_SENDER.test(g.from) && isBankText(`${g.subject}\n${g.text}`)
  },
  parse: (e) => {
    const g = gmail(e)!
    return bankTextToRecs(`${g.subject}\n${g.text}`, e.at)
  },
}
