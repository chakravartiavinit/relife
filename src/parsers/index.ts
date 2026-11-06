import type { Parser } from '@/core/types'
import { bankEmail } from './bank-email'
import { bankSms } from './bank-sms'
import { binance } from './binance'
import { github } from './github'
import { llmFallback } from './llm-fallback'
import { mandateEmail } from './mandate-email'
import { orderEmail } from './order-email'
import { shortcuts } from './shortcuts'
import { sleep } from './sleep'

// Order matters: first match wins. The LLM fallback must stay last.
export const parsers: Parser[] = [
  shortcuts,
  sleep,
  github,
  binance,
  mandateEmail,
  orderEmail,
  bankEmail,
  bankSms,
  llmFallback,
]
