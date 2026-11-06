import { Output } from 'ai'
import { z } from 'zod'
import { aiEnabled, model, modelId } from './models'
import { generate } from './run'
import { mask } from './mask'

const schema = z.object({
  isTransaction: z.boolean().describe('true only if the text reports money moving in or out of an account'),
  amount: z.number().nonnegative().optional(),
  currency: z.string().optional().describe('ISO code, default INR'),
  direction: z.enum(['debit', 'credit']).optional(),
  merchant: z.string().optional().describe('payee / payer name, cleaned'),
  upiId: z.string().optional(),
  balance: z.number().optional().describe('available balance after the transaction, if stated'),
  ref: z.string().optional().describe('UPI / RRN / reference number'),
  accountLast4: z.string().optional().describe('last 4 digits of the account or card'),
  at: z.string().optional().describe('ISO 8601 date-time if stated'),
})

export type ExtractedTransaction = {
  amount: number; currency: string; direction: 'debit' | 'credit'
  merchant?: string; upiId?: string; balance?: number; ref?: string; accountLast4?: string; at?: string
}

/**
 * LLM fallback for bank SMS / emails / OCR text no regex parser understood.
 * ponytail: masks text for hosted providers (UPI handles come back masked); use a local model to keep them.
 */
export async function extractTransaction(text: string): Promise<ExtractedTransaction | null> {
  if (!aiEnabled('parse')) return null
  const local = modelId('parse')?.startsWith('local:')
  const input = (local ? text : mask(text)).slice(0, 4000)
  const res = await generate('parse', 'parse.transaction', {
    model: model('parse'),
    output: Output.object({ schema }),
    system: 'Extract one financial transaction from a bank alert, payment email or receipt. Never invent values; omit unknown fields. OTPs, promotions and balance-only messages are not transactions.',
    prompt: input,
  })
  const o = res.output
  if (!o?.isTransaction || !o.amount || !o.direction) return null
  return {
    amount: o.amount, currency: (o.currency || 'INR').toUpperCase(), direction: o.direction,
    merchant: o.merchant || undefined, upiId: o.upiId || undefined, balance: o.balance,
    ref: o.ref || undefined, accountLast4: o.accountLast4 || undefined, at: o.at || undefined,
  }
}
