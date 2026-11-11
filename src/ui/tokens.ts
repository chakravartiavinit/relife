import type { Category } from '@/db/schema'

// Single source for values that code (charts, native clients later) needs outside CSS.
// Colors resolve to the CSS variables in app/globals.css so they follow the theme.

const wash = (c: string) => `color-mix(in srgb, var(--${c}) 8%, transparent)`

export const CATEGORY: Record<Category, { label: string; color: string; wash: string; blurb: string }> = {
  health: { label: 'Health', color: 'var(--health)', wash: wash('health'), blurb: 'Body, sleep, routines, medicines' },
  mind: { label: 'Mind', color: 'var(--mind)', wash: wash('mind'), blurb: 'Mood, focus, journaling' },
  skills: { label: 'Skills', color: 'var(--skills)', wash: wash('skills'), blurb: 'Code, learning, practice' },
  wealth: { label: 'Wealth', color: 'var(--wealth)', wash: wash('wealth'), blurb: 'Spending, portfolio, subscriptions' },
  hobbies: { label: 'Hobbies', color: 'var(--hobbies)', wash: wash('hobbies'), blurb: 'Practice, play and making things' },
  relationships: { label: 'People', color: 'var(--people)', wash: wash('people'), blurb: 'People and time together' },
}

export const CHART = {
  grid: 'var(--line)',
  axis: 'var(--text-3)',
  accent: 'var(--accent)',
  good: 'var(--mint)',
  bad: 'var(--red)',
  series: ['var(--skills)', 'var(--health)', 'var(--wealth)', 'var(--mind)', 'var(--people)', 'var(--accent)'],
}

/** System quest ranks, E (easy) to S (very hard). */
export type RankKey = 'E' | 'D' | 'C' | 'B' | 'A' | 'S'
export const RANK_KEYS: RankKey[] = ['E', 'D', 'C', 'B', 'A', 'S']
export const RANK: Record<RankKey, string> = {
  E: 'var(--rank-e)', D: 'var(--rank-d)', C: 'var(--rank-c)', B: 'var(--rank-b)', A: 'var(--rank-a)', S: 'var(--rank-s)',
}

export { AREA_ART } from './area-art'
