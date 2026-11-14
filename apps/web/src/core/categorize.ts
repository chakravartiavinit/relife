import { eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { ruleMatches } from '@/domain/merchant-rule'

// Built-in merchant knowledge. User rules (merchant_rules table) win over these.
// Pattern = lowercase substring of merchant name or UPI id.
// A RegExp pattern is for words that must start a word ("cc bill" is not "ACC BILL").
const BUILTIN: [pattern: string | RegExp, merchant: string, category: string][] = [
  // A card bill paid from a bank account must not count on top of the card's own rows (statement imports).
  ['credit card payment', 'Card payment', 'Transfers'],
  ['cc payment', 'Card payment', 'Transfers'],
  [/(^|[^a-z])(cc|credit ?card) bill/, 'Card payment', 'Transfers'], // "CC BILL PAYMENT HDFC", "CREDIT CARD BILL"
  ['self transfer', 'Self transfer', 'Transfers'],
  ['instamart', 'Swiggy Instamart', 'Groceries'],
  ['swiggy', 'Swiggy', 'Food delivery'],
  ['zomato', 'Zomato', 'Food delivery'],
  ['blinkit', 'Blinkit', 'Groceries'],
  ['grofers', 'Blinkit', 'Groceries'],
  ['zepto', 'Zepto', 'Groceries'],
  ['kiranakart', 'Zepto', 'Groceries'],
  ['bigbasket', 'BigBasket', 'Groceries'],
  ['dmart', 'DMart', 'Groceries'],
  ['amazon', 'Amazon', 'Shopping'],
  ['flipkart', 'Flipkart', 'Shopping'],
  ['myntra', 'Myntra', 'Shopping'],
  ['ajio', 'Ajio', 'Shopping'],
  ['nykaa', 'Nykaa', 'Personal care'],
  ['uber', 'Uber', 'Transport'],
  ['olacabs', 'Ola', 'Transport'],
  ['rapido', 'Rapido', 'Transport'],
  ['irctc', 'IRCTC', 'Travel'],
  ['makemytrip', 'MakeMyTrip', 'Travel'],
  ['indigo', 'IndiGo', 'Travel'],
  ['netflix', 'Netflix', 'Subscriptions'],
  ['spotify', 'Spotify', 'Subscriptions'],
  ['youtube', 'YouTube', 'Subscriptions'],
  ['anthropic', 'Anthropic', 'Subscriptions'],
  ['claude', 'Claude', 'Subscriptions'],
  ['openai', 'OpenAI', 'Subscriptions'],
  ['github', 'GitHub', 'Subscriptions'],
  ['apple', 'Apple', 'Subscriptions'],
  ['google', 'Google', 'Subscriptions'],
  ['airtel', 'Airtel', 'Bills'],
  ['jio', 'Jio', 'Bills'],
  ['bescom', 'BESCOM', 'Bills'],
  ['electricity', 'Electricity', 'Bills'],
  ['pharmeasy', 'PharmEasy', 'Health'],
  ['1mg', 'Tata 1mg', 'Health'],
  ['apollo', 'Apollo', 'Health'],
  ['cult', 'Cult.fit', 'Health'],
  ['zerodha', 'Zerodha', 'Investments'],
  ['groww', 'Groww', 'Investments'],
  ['binance', 'Binance', 'Investments'],
  ['credit card autopay', 'Card payment', 'Transfers'],
]

export type Categorized = { merchant?: string; category: string }

/** The built-in rule a lowercase description or UPI id hits, if any. */
export function builtinRule(hay: string): Categorized | undefined {
  const hit = BUILTIN.find(([pattern]) => (typeof pattern === 'string' ? hay.includes(pattern) : pattern.test(hay)))
  return hit && { merchant: hit[1], category: hit[2] }
}

export async function categorize(userId: string, merchant?: string, upiId?: string): Promise<Categorized> {
  const hay = `${merchant ?? ''} ${upiId ?? ''}`.toLowerCase()
  const rules = await db.select().from(schema.merchantRules).where(eq(schema.merchantRules.userId, userId))
  const hit = rules.find((r) => ruleMatches(hay, r.pattern)) ?? builtinRule(hay)
  if (hit) return { merchant: hit.merchant, category: hit.category }
  return { merchant: merchant ?? upiId, category: 'Uncategorized' }
}

export const SPEND_CATEGORIES = [
  'Food delivery', 'Groceries', 'Dining out', 'Shopping', 'Transport', 'Travel', 'Subscriptions',
  'Bills', 'Rent', 'Health', 'Personal care', 'Education', 'Entertainment', 'Gifts', 'Investments',
  'Transfers', 'Income', 'Uncategorized',
] as const
