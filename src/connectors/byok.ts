import type { Connector } from '@/core/types'
import { codewars } from './codewars'
import { hevy } from './hevy'
import { readwise } from './readwise'
import { rescuetime } from './rescuetime'
import { toggl } from './toggl'

// Connectors that need a personal API key from the service (bring your own key), plus Codewars, which only needs a public handle.
export const byokConnectors: Connector[] = [toggl, rescuetime, hevy, readwise, codewars]
