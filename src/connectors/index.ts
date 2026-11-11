import type { Connector } from '@/core/types'
import { binance } from './binance'
import { chesscom, lichess } from './chess'
import { atcoder, codechef, codeforces, leetcode } from './competitive'
import { duolingo } from './duolingo'
import { lastfm } from './lastfm'
import { monkeytype } from './monkeytype'
import { steam } from './steam'
import { strava } from './strava'
import { todoist } from './todoist'
import { wakatime } from './wakatime'
import { laptop } from './laptop'
import { fx } from './fx'
import { github } from './github'
import { icloudInbox } from './icloud-inbox'
import { shopConnectors } from './shop'

// One file per source. A connector whose env vars are missing is skipped (see docs/CONNECTORS.md).
export const connectors: Connector[] = [
  icloudInbox, laptop, fx, github, codeforces, codechef, atcoder, leetcode, lichess, chesscom, binance,
  strava, wakatime, monkeytype, duolingo, todoist, lastfm, steam, ...shopConnectors,
]
