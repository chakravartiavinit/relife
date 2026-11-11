import type { Parser, Rec, TrackerDefaults } from '@/core/types'
import type { TogglDay } from '@/connectors/toggl'
import type { RescueDay } from '@/connectors/rescuetime'
import type { HevyDay } from '@/connectors/hevy'
import type { ReadwiseDay } from '@/connectors/readwise'
import type { CodewarsDay } from '@/connectors/codewars'
import { asObj } from './util'

// Days from the bring-your-own-key connectors (src/connectors/byok.ts), one summary per day like src/parsers/daily.ts.
// Each day becomes tracker entries; the latest sync of a day wins. "More is better" trackers get a direction and a
// target so they count for quests and patterns. Entries are per tracker, day and source, so exercise.minutes from
// Hevy adds to Strava's and cp.solved from Codewars to the other sites'.

type Entry = { tracker: string; value: number | undefined; defaults: TrackerDefaults; meta?: Record<string, unknown> }

const BYOK: Record<string, (b: Record<string, unknown>) => Entry[]> = {
  toggl: (b) => {
    const d = b as TogglDay
    return [{ tracker: 'tracked.minutes', value: d.minutes, meta: { project: d.topProject, entries: d.entries }, defaults: { name: 'Tracked time', category: 'skills', kind: 'duration', unit: 'min', direction: 'up', target: 120 } }]
  },
  rescuetime: (b) => {
    const d = b as RescueDay
    return [
      { tracker: 'productivity.pulse', value: d.pulse, meta: { loggedMin: d.loggedMin }, defaults: { name: 'Productivity pulse', category: 'mind', kind: 'number', aggregate: 'last', direction: 'up', target: 70 } },
      { tracker: 'productive.minutes', value: d.productiveMin, defaults: { name: 'Productive time', category: 'mind', kind: 'duration', unit: 'min', direction: 'up', target: 240 } },
      { tracker: 'distracting.minutes', value: d.distractingMin, defaults: { name: 'Distracting time', category: 'mind', kind: 'duration', unit: 'min', direction: 'down', target: 60 } },
    ]
  },
  hevy: (b) => {
    const d = b as HevyDay
    return [
      // The same tracker Strava fills; the source keeps them apart and they add up.
      { tracker: 'exercise.minutes', value: d.minutes, meta: { workouts: d.workouts }, defaults: { name: 'Active minutes', category: 'health', kind: 'duration', unit: 'min', direction: 'up', target: 30 } },
      { tracker: 'hevy.workouts', value: d.workouts, meta: { exercises: d.exercises }, defaults: { name: 'Gym workouts', category: 'health', kind: 'number', direction: 'up', target: 1 } },
      { tracker: 'hevy.volume', value: d.volumeKg, defaults: { name: 'Weight lifted', category: 'health', kind: 'number', unit: 'kg', direction: 'up', target: 5000 } },
    ]
  },
  readwise: (b) => {
    const d = b as ReadwiseDay
    return [{ tracker: 'highlights.made', value: d.highlights, meta: { sources: d.sources }, defaults: { name: 'Highlights', category: 'mind', kind: 'number', direction: 'up', target: 3 } }]
  },
  codewars: (b) => {
    const d = b as CodewarsDay
    return [
      // Counts as a solved problem, next to Codeforces, LeetCode and the rest (parsers/competitive.ts).
      { tracker: 'cp.solved', value: d.solved, defaults: { name: 'Problems solved', category: 'skills', kind: 'number', direction: 'up', target: 1 } },
      // The next hundred is the first goal, so honor counts as "higher is better".
      { tracker: 'codewars.honor', value: d.honor, defaults: { name: 'Codewars honor', category: 'skills', kind: 'number', aggregate: 'last', direction: 'up', target: Math.floor((d.honor ?? 0) / 100) * 100 + 100 } },
    ]
  },
}

export const byok: Parser = {
  id: 'byok',
  match: (e) => Object.hasOwn(BYOK, e.source),
  parse: (e) => {
    const b = asObj(e)
    const date = String(b.date ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return []
    return BYOK[e.source](b).filter((x) => Number.isFinite(x.value)).map((x): Rec => ({
      kind: 'entry', tracker: x.tracker, date, value: x.value!, source: e.source, verified: true,
      ...(x.meta && Object.values(x.meta).some((v) => v != null) ? { meta: x.meta } : {}), defaults: x.defaults,
    }))
  },
}
