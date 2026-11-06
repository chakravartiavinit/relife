import { createHash } from 'node:crypto'
import type { Rec } from '@/core/types'
import { wallToUtc } from '@/core/time'

// Shared Indian bank alert parser (SMS, email body, screenshot OCR).
// Formats differ per bank and change over time: add your real messages to
// src/parsers/fixtures/ and tighten the patterns here when one fails.

const BANKS: [RegExp, string, string][] = [
  [/axis/i, 'axis', 'Axis Bank'],
  [/hdfc/i, 'hdfc', 'HDFC Bank'],
  [/icici/i, 'icici', 'ICICI Bank'],
  [/\bsbi\b|state bank/i, 'sbi', 'SBI'],
  [/kotak/i, 'kotak', 'Kotak'],
  [/idfc/i, 'idfc', 'IDFC First'],
  [/yes ?bank/i, 'yes', 'Yes Bank'],
  [/indusind/i, 'indusind', 'IndusInd'],
  [/federal/i, 'federal', 'Federal Bank'],
]

export function detectBank(text: string): { slug: string; name: string } {
  const hit = BANKS.find(([re]) => re.test(text))
  return hit ? { slug: hit[1], name: hit[2] } : { slug: 'bank', name: 'Bank' }
}

const AMOUNT = /(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/gi
const HAS_AMOUNT = /(?:INR|Rs\.?|₹)\s*\d/i
const DEBIT = /\b(debited|spent|withdrawn|paid|sent|debit)\b/i
const CREDIT = /\b(credited|received|deposited|refund(?:ed)?|credit)\b/i
// Not a completed transaction: OTPs, future/pre-debit notices, failures, requests.
const NOT_TXN = /\bOTP\b|one time password|will be debited|to be debited|is due|due (?:on|by)|pre-?debit|scheduled|request(?:ed)? (?:money|payment)|\bfailed\b|declined|unsuccessful/i

export function isBankText(text: string) {
  return HAS_AMOUNT.test(text) && (DEBIT.test(text) || CREDIT.test(text))
}

export type BankTxn = {
  amount: number // positive
  direction: 'debit' | 'credit'
  last4?: string
  isCard: boolean
  ref?: string
  merchant?: string
  upiId?: string
  balance?: number
  at?: Date
}

const num = (s: string) => Number(s.replace(/,/g, ''))

export function extractBankTxn(text: string): BankTxn | null {
  if (NOT_TXN.test(text)) return null
  // Drop the 'Not you? SMS BLOCK … to 9199…' footer: its number looks like a payee.
  const t = text.replace(/\r/g, '').replace(/not you\?[^\n]*/gi, '')

  // Amounts: the first one not labelled as a balance/limit is the transaction amount.
  let amount: number | undefined
  let balance: number | undefined
  for (const m of t.matchAll(AMOUNT)) {
    const before = t.slice(Math.max(0, m.index! - 22), m.index!)
    if (/(bal(?:ance)?|limit)\W*[:\-]?\s*$/i.test(before)) {
      if (/bal/i.test(before) && balance === undefined) balance = num(m[1])
      continue
    }
    if (amount === undefined) amount = num(m[1])
  }
  if (!amount) return null

  const d = DEBIT.exec(t)
  const c = CREDIT.exec(t)
  if (!d && !c) return null
  const direction = d && (!c || d.index < c.index) ? 'debit' : 'credit'

  const acct = /(?:a\/c|acct|account|card)(?:\s*(?:no\.?|number|ending))?\s*[:\-]?\s*(?:[x*]+\s*)?(\d{4})\b/i.exec(t)
  const isCard = /\bcard\b/i.test(t) && !/a\/c|account/i.test(acct?.[0] ?? '')

  const ref =
    /UPI\/(?:P2[AMP]\/)?(\d{9,14})/i.exec(t)?.[1] ??
    /(?:UPI\s*Ref(?:erence)?(?:\s*No\.?)?|RRN|Ref(?:\s*No\.?)?|Txn\s*(?:ID|No\.?))\s*[:.\-]?\s*([A-Z0-9]{9,22})/i.exec(t)?.[1] ??
    /\b(?:NEFT|IMPS|RTGS)[\/\-\s]+([A-Z0-9]{8,22})/i.exec(t)?.[1]

  const upiId = /\b([\w.\-]{2,}@[a-z]{2,})\b(?!\.)/i.exec(t)?.[1]?.toLowerCase()

  const merchant = clean(
    /UPI\/P2[AMP]\/\d{9,14}\/([^\/\n]+)/i.exec(t)?.[1] ??
    /\b(?:NEFT|IMPS|RTGS)\/[A-Z0-9]+\/([^\/\n.]+)/i.exec(t)?.[1] ??
    /(?:\bat|\bto|paid to|sent to|towards)\s+(?:VPA\s+)?([A-Za-z0-9][\w .&'\-]{1,40}?)(?=\s+(?:on|via|ref|UPI|Avl|Avbl|\(|\.)|\.|\n|$)/i.exec(t)?.[1] ??
    cardLineMerchant(t) ??
    (/\bATM\b/i.test(t) ? 'ATM withdrawal' : undefined),
  )

  return { amount, direction, last4: acct?.[1], isCard, ref, merchant: merchant || undefined, upiId, balance, at: bankTime(t) }
}

// Multi-line card alerts put the merchant on its own line after the timestamp.
function cardLineMerchant(t: string) {
  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean)
  const i = lines.findIndex((l) => /\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}.*\d{1,2}:\d{2}/.test(l))
  const next = i >= 0 ? lines[i + 1] : undefined
  return next && !/avl|avbl|limit|not you|block|bal/i.test(next) && !HAS_AMOUNT.test(next) ? next : undefined
}

function clean(s?: string) {
  if (!s) return undefined
  const v = s.replace(/\s+/g, ' ').trim().replace(/[.,;:-]+$/, '')
  if (/@/.test(v) && !/\s/.test(v)) return undefined // a bare VPA is kept in upiId
  return v || undefined
}

/** Bank alerts are in IST: "05-11-26, 14:32:10" or "05/11/2026 14:32". */
function bankTime(t: string): Date | undefined {
  const m = /(\d{1,2})[-\/](\d{1,2}|[A-Za-z]{3})[-\/](\d{2,4})[,\s]+(?:at\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(t)
  if (!m) return undefined
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  const mon = /\d/.test(m[2]) ? Number(m[2]) : months.indexOf(m[2].toLowerCase()) + 1
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  if (!mon || mon > 12) return undefined
  const wall = new Date(Date.UTC(year, mon - 1, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0)))
  return Number.isNaN(wall.getTime()) ? undefined : wallToUtc(wall, 'Asia/Kolkata')
}

export function hashRef(...parts: (string | number | undefined)[]) {
  return 'h:' + createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16)
}

/** Bank text → transaction record. `fallbackAt` is when we received the message. */
export function bankTextToRecs(text: string, fallbackAt: Date): Rec[] {
  const x = extractBankTxn(text)
  if (!x) return []
  const bank = detectBank(text)
  const at = x.at ?? fallbackAt
  const kind = x.isCard ? 'card' : 'bank'
  const last4 = x.last4 ?? 'xxxx'
  return [{
    kind: 'transaction',
    account: {
      key: `${bank.slug}:${kind === 'card' ? 'card:' : ''}${last4}`,
      kind,
      name: `${bank.name} ${kind === 'card' ? 'Card ' : ''}••${last4}`,
      institution: bank.name,
      currency: 'INR',
    },
    at,
    amount: x.direction === 'debit' ? -x.amount : x.amount,
    currency: 'INR',
    merchant: x.merchant,
    upiId: x.upiId,
    // Card alerts report available credit limit, not a balance.
    balance: kind === 'bank' ? x.balance : undefined,
    source: bank.slug,
    // SMS and email of one payment share the bank ref, so they dedupe.
    externalRef: x.ref ?? hashRef(x.amount, last4, at.toISOString().slice(0, 16)),
  }]
}
