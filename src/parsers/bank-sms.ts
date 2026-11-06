import type { Parser } from '@/core/types'
import { bankTextToRecs, isBankText } from './bank-text'
import { eventText } from './util'

/** Bank SMS (via iPhone Shortcuts) and screenshots of bank/UPI receipts (OCR). */
export const bankSms: Parser = {
  id: 'bank-sms',
  match: (e) => (e.source === 'sms' || e.source === 'ocr') && isBankText(eventText(e)),
  parse: (e) => bankTextToRecs(eventText(e), e.at),
}
