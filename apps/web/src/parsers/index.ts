import type { Parser } from '@/core/types'
import { appOrder } from './app-order'
import { appOrderItems } from './app-order-items'
import { binance } from './binance'
import { chess } from './chess'
import { competitive } from './competitive'
import { daily } from './daily'
import { github } from './github'
import { healthExport } from './health-export'
import { shortcuts } from './shortcuts'
import { sleep } from './sleep'
import { statement } from './statement'
import { takeout } from './takeout'
import { trackerCsv } from './tracker-csv'

// Order matters: first match wins.
export const parsers: Parser[] = [
  shortcuts,
  sleep,
  github,
  chess,
  competitive,
  daily,
  binance,
  appOrder,
  appOrderItems,
  // File imports (src/core/imports).
  statement,
  healthExport,
  takeout,
  trackerCsv,
]
