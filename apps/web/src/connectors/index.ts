import type { Connector } from '@/core/types'
import { binance } from './binance'
import { chesscom, lichess } from './chess'
import { atcoder, codechef, codeforces, leetcode } from './competitive'
import { duolingo } from './duolingo'
import { lastfm } from './lastfm'
import { monkeytype } from './monkeytype'
import { steam } from './steam'
import { strava } from './strava'
import { oura } from './oura'
import { whoop } from './whoop'
import { withings } from './withings'
import { googleCalendar } from './google-calendar'
import { todoist } from './todoist'
import { wakatime } from './wakatime'
import { laptop } from './laptop'
import { fx } from './fx'
import { github } from './github'
import { icloudInbox } from './icloud-inbox'
import { shopConnectors } from './shop'
import { toggl } from './toggl'
import { rescuetime } from './rescuetime'
import { hevy } from './hevy'
import { readwise } from './readwise'
import { codewars } from './codewars'
import { letterboxd } from './letterboxd'
import { openlibrary } from './openlibrary'
import { anki } from './anki'

// One file per source. A connector whose env vars are missing is skipped (see docs/CONNECTORS.md).
export const connectors: Connector[] = [
  icloudInbox, laptop, fx, github, codeforces, codechef, atcoder, leetcode, lichess, chesscom, binance,
  strava, oura, whoop, withings, googleCalendar, wakatime, monkeytype, duolingo, todoist, lastfm, steam,
  toggl, rescuetime, hevy, readwise, codewars, letterboxd, openlibrary, anki, ...shopConnectors,
]
