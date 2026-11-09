import type { Connector } from '@/core/types'
import { binance } from './binance'
import { chesscom, lichess } from './chess'
import { atcoder, codechef, codeforces } from './competitive'
import { laptop } from './laptop'
import { fx } from './fx'
import { github } from './github'
import { icloudInbox } from './icloud-inbox'
import { shopConnectors } from './shop'

// One file per source. A connector whose env vars are missing is skipped (see docs/CONNECTORS.md).
export const connectors: Connector[] = [icloudInbox, laptop, fx, github, codeforces, codechef, atcoder, lichess, chesscom, binance, ...shopConnectors]
