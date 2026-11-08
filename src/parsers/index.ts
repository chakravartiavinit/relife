import type { Parser } from '@/core/types'
import { appOrder } from './app-order'
import { appOrderItems } from './app-order-items'
import { bankEmail } from './bank-email'
import { bankSms } from './bank-sms'
import { binance } from './binance'
import { chess } from './chess'
import { competitive } from './competitive'
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
  chess,
  competitive,
  binance,
  mandateEmail,
  appOrder,
  appOrderItems,
  orderEmail,
  bankEmail,
  bankSms,
  llmFallback,
]
