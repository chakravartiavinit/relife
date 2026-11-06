import { eq } from 'drizzle-orm'
import { db, schema } from '@/db'

// Built-in merchant knowledge. User rules (merchant_rules table) win over these.
// Pattern = lowercase substring of merchant name or UPI id.
const BUILTIN: [pattern: string, merchant: string, category: string][] = [
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
]

export type Categorized = { merchant?: string; category: string }

export async function categorize(userId: string, merchant?: string, upiId?: string): Promise<Categorized> {
  const hay = `${merchant ?? ''} ${upiId ?? ''}`.toLowerCase()
  const rules = await db.select().from(schema.merchantRules).where(eq(schema.merchantRules.userId, userId))
  const hit =
    rules.find((r) => hay.includes(r.pattern)) ??
    BUILTIN.map(([pattern, m, category]) => ({ pattern, merchant: m, category })).find((r) => hay.includes(r.pattern))
  if (hit) return { merchant: hit.merchant, category: hit.category }
  return { merchant: merchant ?? upiId, category: 'Uncategorized' }
}

export const SPEND_CATEGORIES = [
  'Food delivery', 'Groceries', 'Dining out', 'Shopping', 'Transport', 'Travel', 'Subscriptions',
  'Bills', 'Rent', 'Health', 'Personal care', 'Education', 'Entertainment', 'Gifts', 'Investments',
  'Transfers', 'Income', 'Uncategorized',
] as const
