import { cache } from 'react'
import type { Category } from '@/db/schema'
import { summarizeTracker } from '@/domain/metric-tile'
import type { TargetTracker } from '@/domain/target-rows'
import { trackerDays, trackerFacts } from '../metrics'
import { addDays } from '../time'
import type { User } from '../user'

/**
 * Every tracker of an area with its last 90 days and its tile summary, read once per request: the targets table
 * and All metrics on the Overview share it.
 */
export const loadAreaTrackers = cache(async (user: User, category: Category, today: string): Promise<TargetTracker[]> => {
  const from = addDays(today, -89)
  const days = await trackerDays(user, from, today, { category })
  const facts = await trackerFacts(user, from, today, days.filter((d) => d.days.size).map((d) => d.tracker.id))
  return days.map((d) => ({ tracker: d.tracker, days: d.days, tile: summarizeTracker(d.tracker, d.days, today, facts.get(d.tracker.id)) }))
})
