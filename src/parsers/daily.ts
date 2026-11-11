import type { Parser, Rec, TrackerDefaults } from '@/core/types'
import type { WakaDay } from '@/connectors/wakatime'
import type { StravaDay } from '@/connectors/strava'
import type { TodoistDay } from '@/connectors/todoist'
import type { LastfmDay } from '@/connectors/lastfm'
import type { SteamDay } from '@/connectors/steam'
import type { DuolingoDay } from '@/connectors/duolingo'
import type { TypingDay } from '@/connectors/monkeytype'
import { asObj } from './util'

// One-summary-per-day sources (src/connectors/daily.ts). Each day becomes tracker entries; the latest sync
// of a day wins. Trackers join Patterns, the System's quests and Settings → The System on their own.
// A target makes "more is better" count for quests and patterns, so trackers you'd want more of get one.

type Entry = { tracker: string; value: number | undefined; defaults: TrackerDefaults; meta?: Record<string, unknown> }

const DAYS: Record<string, (b: Record<string, unknown>) => Entry[]> = {
  wakatime: (b) => {
    const d = b as WakaDay
    return [{ tracker: 'coding.minutes', value: d.minutes, meta: { language: d.language, project: d.project }, defaults: { name: 'Coding time', category: 'skills', kind: 'duration', unit: 'min', direction: 'up', target: 60 } }]
  },
  strava: (b) => {
    const d = b as StravaDay
    const km = (tracker: string, name: string, v: number): Entry[] => (v > 0 ? [{ tracker, value: v, defaults: { name, category: 'health', unit: 'km', direction: 'up' } }] : [])
    return [
      { tracker: 'exercise.minutes', value: d.minutes, meta: { activities: d.activities }, defaults: { name: 'Active minutes', category: 'health', kind: 'duration', unit: 'min', direction: 'up', target: 30 } },
      ...km('run.km', 'Running', d.runKm), ...km('ride.km', 'Cycling', d.rideKm), ...km('hike.km', 'Walks and hikes', d.walkKm), ...km('swim.km', 'Swimming', d.swimKm),
    ]
  },
  todoist: (b) => {
    const d = b as TodoistDay
    return [{ tracker: 'tasks.done', value: d.done, meta: d.topProject ? { project: d.topProject } : undefined, defaults: { name: 'Tasks done', category: 'mind', kind: 'number', direction: 'up', target: 5 } }]
  },
  // Listening and gaming are time spent, not practice: no target, and they don't earn hobby XP (core/xp.ts).
  lastfm: (b) => {
    const d = b as LastfmDay
    return [
      { tracker: 'music', value: d.minutes, meta: d.topArtist ? { artist: d.topArtist } : undefined, defaults: { name: 'Music', category: 'hobbies', kind: 'duration', unit: 'min' } },
      { tracker: 'music.songs', value: d.tracks, defaults: { name: 'Songs played', category: 'hobbies', kind: 'number' } },
    ]
  },
  steam: (b) => {
    const d = b as SteamDay
    return [{ tracker: 'gaming', value: d.minutes, meta: d.topGame ? { game: d.topGame } : undefined, defaults: { name: 'Gaming', category: 'hobbies', kind: 'duration', unit: 'min' } }]
  },
  duolingo: (b) => {
    const d = b as DuolingoDay
    return [
      { tracker: 'duolingo.xp', value: d.xp, meta: d.course ? { course: d.course } : undefined, defaults: { name: 'Duolingo XP', category: 'skills', kind: 'number', direction: 'up', target: 30 } },
      { tracker: 'duolingo.streak', value: d.streak, defaults: { name: 'Duolingo streak', category: 'skills', kind: 'number', aggregate: 'last' } },
    ]
  },
  monkeytype: (b) => {
    const d = b as TypingDay
    return [
      { tracker: 'typing.minutes', value: d.minutes, meta: { tests: d.tests }, defaults: { name: 'Typing practice', category: 'skills', kind: 'duration', unit: 'min' } },
      // The next ten is the first goal, so speed counts as "higher is better" for quests and patterns.
      { tracker: 'typing.wpm', value: d.tests ? d.wpm : undefined, meta: { best: d.best, accuracy: d.accuracy }, defaults: { name: 'Typing speed', category: 'skills', kind: 'number', unit: 'wpm', aggregate: 'last', direction: 'up', target: Math.floor((d.wpm ?? 0) / 10) * 10 + 10 } },
    ]
  },
}

export const daily: Parser = {
  id: 'daily',
  match: (e) => Object.hasOwn(DAYS, e.source),
  parse: (e) => {
    const b = asObj(e)
    const date = String(b.date ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return []
    return DAYS[e.source](b).filter((x) => x.value != null && Number.isFinite(x.value)).map((x): Rec => ({
      kind: 'entry', tracker: x.tracker, date, value: x.value!, source: e.source, verified: true,
      ...(x.meta && Object.values(x.meta).some((v) => v != null) ? { meta: x.meta } : {}), defaults: x.defaults,
    }))
  },
}
