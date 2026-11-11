import type { Parser } from '@/core/types'
import { appOrder } from './app-order'
import { appOrderItems } from './app-order-items'
import { binance } from './binance'
import { chess } from './chess'
import { competitive } from './competitive'
import { daily } from './daily'
import { byok } from './byok'
import { feeds } from './feeds'
import { github } from './github'
import { shortcuts } from './shortcuts'
import { sleep } from './sleep'

// Order matters: first match wins.
export const parsers: Parser[] = [
  shortcuts,
  sleep,
  github,
  chess,
  competitive,
  daily,
  byok,
  feeds,
  binance,
  appOrder,
  appOrderItems,
]
