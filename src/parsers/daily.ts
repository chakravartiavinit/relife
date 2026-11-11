import type { Parser, Rec, TrackerDefaults } from '@/core/types'
import type { WakaDay } from '@/connectors/wakatime'
import type { StravaDay } from '@/connectors/strava'
import type { TodoistDay } from '@/connectors/todoist'
import type { LastfmDay } from '@/connectors/lastfm'
import type { SteamDay } from '@/connectors/steam'
import type { DuolingoDay } from '@/connectors/duolingo'
import type { TypingDay } from '@/connectors/monkeytype'
import type { OuraDay } from '@/connectors/oura'
import type { WhoopDay } from '@/connectors/whoop'
import type { WithingsDay } from '@/connectors/withings'
import type { CalendarDay } from '@/connectors/google-calendar'
import type { TogglDay } from '@/connectors/toggl'
import type { RescueDay } from '@/connectors/rescuetime'
import type { HevyDay } from '@/connectors/hevy'
import type { ReadwiseDay } from '@/connectors/readwise'
import type { CodewarsDay } from '@/connectors/codewars'
import type { LetterboxdDay } from '@/connectors/letterboxd'
import type { BooksDay } from '@/connectors/openlibrary'
import type { AnkiDay } from '@/connectors/anki'
import { asObj } from './util'

// One-summary-per-day sources (src/connectors/daily.ts). Each day becomes tracker entries; the latest sync
// of a day wins. Trackers join Patterns, the System's quests and Settings → The System on their own.
// A target makes "more is better" count for quests and patterns, so trackers you'd want more of get one.

type Entry = { tracker: string; value: number | undefined; defaults: TrackerDefaults; meta?: Record<string, unknown> }

// Shared by the wearables, so a quest on sleep or HRV works whichever device you wear. Same defaults as the
// iPhone Health trackers (src/parsers/shortcuts.ts). Steps stay per device (oura.steps…): two devices
// would double them in one tracker; core/xp.ts takes the highest.
const SLEEP: TrackerDefaults = { name: 'Sleep', category: 'health', unit: 'h', target: 7.5, aggregate: 'last', direction: 'up' }
const SLEEP_SCORE: TrackerDefaults = { name: 'Sleep score', category: 'health', kind: 'number', aggregate: 'last', direction: 'up', target: 85 }
const HRV: TrackerDefaults = { name: 'HRV', category: 'health', unit: 'ms', aggregate: 'last', direction: 'up' }
const RESTING_HR: TrackerDefaults = { name: 'Resting heart rate', category: 'health', unit: 'bpm', aggregate: 'last', direction: 'down' }
const steps = (tracker: string, name: string, v?: number): Entry => ({ tracker, value: v, defaults: { name, category: 'health', direction: 'up', target: 8000 } })
const body = (d: { sleepHours?: number; sleepScore?: number; hrv?: number; restingHr?: number }): Entry[] => [
  { tracker: 'sleep.hours', value: d.sleepHours, defaults: SLEEP },
  { tracker: 'sleep.score', value: d.sleepScore, defaults: SLEEP_SCORE },
  { tracker: 'hrv', value: d.hrv, defaults: HRV },
  { tracker: 'resting.hr', value: d.restingHr, defaults: RESTING_HR },
]

const DAYS: Record<string, (b: Record<string, unknown>) => Entry[]> = {
  oura: (b) => {
    const d = b as OuraDay
    return [...body(d), { tracker: 'oura.readiness', value: d.readiness, defaults: { name: 'Oura readiness', category: 'health', kind: 'number', aggregate: 'last', direction: 'up', target: 85 } }, steps('oura.steps', 'Oura steps', d.steps)]
  },
  whoop: (b) => {
    const d = b as WhoopDay
    return [
      ...body(d),
      { tracker: 'whoop.recovery', value: d.recovery, defaults: { name: 'WHOOP recovery', category: 'health', kind: 'number', unit: '%', aggregate: 'last', direction: 'up', target: 67 } },
      { tracker: 'whoop.strain', value: d.strain, defaults: { name: 'WHOOP strain', category: 'health', kind: 'number', aggregate: 'last' } },
    ]
  },
  withings: (b) => {
    const d = b as WithingsDay
    return [
      ...body(d),
      { tracker: 'weight', value: d.weight, defaults: { name: 'Weight', category: 'health', unit: 'kg', aggregate: 'last', direction: 'down' } },
      { tracker: 'body.fat', value: d.fat, defaults: { name: 'Body fat', category: 'health', unit: '%', aggregate: 'last', direction: 'down' } },
      steps('withings.steps', 'Withings steps', d.steps),
    ]
  },
  'google-calendar': (b) => {
    const d = b as CalendarDay
    return [
      // Meetings aren't good or bad by themselves, so no direction; Patterns still links them to sleep or mood.
      { tracker: 'meetings.minutes', value: d.meetingMinutes, meta: { meetings: d.meetings }, defaults: { name: 'Meetings', category: 'mind', kind: 'duration', unit: 'min' } },
      { tracker: 'focus.minutes', value: d.focusMinutes, defaults: { name: 'Focus time', category: 'mind', kind: 'duration', unit: 'min', direction: 'up', target: 60 } },
    ]
  },
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
    return [{ tracker: 'tasks.done', value: d.done, meta: { project: d.topProject }, defaults: { name: 'Tasks done', category: 'mind', kind: 'number', direction: 'up', target: 5 } }]
  },
  // Listening and gaming are time spent, not practice: no target, and they don't earn hobby XP (core/xp.ts).
  lastfm: (b) => {
    const d = b as LastfmDay
    return [
      // Own slugs, so a "music" practice tracker someone already logs stays practice.
      { tracker: 'listening', value: d.minutes, meta: { artist: d.topArtist }, defaults: { name: 'Music listening', category: 'hobbies', kind: 'duration', unit: 'min' } },
      { tracker: 'listening.songs', value: d.tracks, defaults: { name: 'Songs played', category: 'hobbies', kind: 'number' } },
    ]
  },
  steam: (b) => {
    const d = b as SteamDay
    return [{ tracker: 'playtime', value: d.minutes, meta: { game: d.topGame }, defaults: { name: 'Steam playtime', category: 'hobbies', kind: 'duration', unit: 'min' } }]
  },
  duolingo: (b) => {
    const d = b as DuolingoDay
    return [
      { tracker: 'duolingo.xp', value: d.xp, meta: { course: d.course }, defaults: { name: 'Duolingo XP', category: 'skills', kind: 'number', direction: 'up', target: 30 } },
      { tracker: 'duolingo.streak', value: d.streak, meta: { practised: d.practised }, defaults: { name: 'Duolingo streak', category: 'skills', kind: 'number', aggregate: 'last' } },
    ]
  },
  monkeytype: (b) => {
    const d = b as TypingDay
    return [
      { tracker: 'typing.minutes', value: d.minutes, meta: { tests: d.tests }, defaults: { name: 'Typing practice', category: 'skills', kind: 'duration', unit: 'min' } },
      // The next ten is the first goal, so speed counts as "higher is better" for quests and patterns.
      { tracker: 'typing.wpm', value: d.wpm, meta: { best: d.best, accuracy: d.accuracy }, defaults: { name: 'Typing speed', category: 'skills', kind: 'number', unit: 'wpm', aggregate: 'last', direction: 'up', target: Math.floor((d.wpm ?? 0) / 10) * 10 + 10 } },
    ]
  },
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
      // Its own tracker, not Strava's exercise.minutes: Hevy can post each workout to Strava too, so adding them
      // would count a session twice. XP and the workout-gap alert take the larger of the two per day.
      { tracker: 'hevy.minutes', value: d.minutes, meta: { workouts: d.workouts }, defaults: { name: 'Gym minutes', category: 'health', kind: 'duration', unit: 'min', direction: 'up', target: 30 } },
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
  // Films are time spent, not practice: no target, no unit, so no hobby XP (core/xp.ts counts only minutes).
  letterboxd: (b) => {
    const d = b as LetterboxdDay
    return [{ tracker: 'films.watched', value: d.films, meta: { titles: d.titles, rating: d.rating }, defaults: { name: 'Films watched', category: 'hobbies', kind: 'number' } }]
  },
  openlibrary: (b) => {
    const d = b as BooksDay
    return [{ tracker: 'books.read', value: d.books, meta: { titles: d.titles }, defaults: { name: 'Books read', category: 'mind', kind: 'number', direction: 'up' } }]
  },
  anki: (b) => {
    const d = b as AnkiDay
    return [
      { tracker: 'anki.cards', value: d.cards, defaults: { name: 'Anki cards', category: 'skills', kind: 'number', unit: 'cards', direction: 'up', target: 20 } },
      { tracker: 'anki.minutes', value: d.minutes, defaults: { name: 'Anki study time', category: 'skills', kind: 'duration', unit: 'min', direction: 'up' } },
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
    return DAYS[e.source](b).filter((x) => Number.isFinite(x.value)).map((x): Rec => ({
      kind: 'entry', tracker: x.tracker, date, value: x.value!, source: e.source, verified: true,
      ...(x.meta && Object.values(x.meta).some((v) => v != null) ? { meta: x.meta } : {}), defaults: x.defaults,
    }))
  },
}
