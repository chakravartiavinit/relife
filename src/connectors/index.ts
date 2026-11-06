import type { Connector } from '@/core/types'
import { binance } from './binance'
import { fx } from './fx'
import { github } from './github'
import { gmail } from './gmail'
import { icloudInbox } from './icloud-inbox'

// One file per source. A connector whose env vars are missing is skipped (see docs/CONNECTORS.md).
export const connectors: Connector[] = [icloudInbox, fx, github, binance, gmail]
