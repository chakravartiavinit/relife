import type { Category } from '@/db/schema'

// Single source for values that code (charts, native clients later) needs outside CSS.
// Colors resolve to the CSS variables in app/globals.css so they follow the theme.

export const CATEGORY: Record<Category, { label: string; color: string; wash: string; blurb: string }> = {
  health: { label: 'Health', color: 'var(--cat-health)', wash: 'color-mix(in oklch, var(--cat-health) 12%, transparent)', blurb: 'Body, sleep, routines, medicines' },
  mind: { label: 'Mind', color: 'var(--cat-mind)', wash: 'color-mix(in oklch, var(--cat-mind) 12%, transparent)', blurb: 'Mood, focus, journaling' },
  skills: { label: 'Skills', color: 'var(--cat-skills)', wash: 'color-mix(in oklch, var(--cat-skills) 12%, transparent)', blurb: 'Code, learning, practice' },
  wealth: { label: 'Wealth', color: 'var(--cat-wealth)', wash: 'color-mix(in oklch, var(--cat-wealth) 14%, transparent)', blurb: 'Spending, portfolio, subscriptions' },
  relationships: { label: 'People', color: 'var(--cat-relationships)', wash: 'color-mix(in oklch, var(--cat-relationships) 12%, transparent)', blurb: 'People and time together' },
}

export const MOTION = {
  ease: [0.2, 0, 0, 1] as const,
  spring: { type: 'spring', duration: 0.3, bounce: 0 } as const,
  stagger: 0.1,
  fast: 0.15,
}

export const CHART = {
  grid: 'var(--divider)',
  axis: 'var(--ink-3)',
  accent: 'var(--pill)',
  good: 'var(--good)',
  bad: 'var(--bad)',
  series: ['var(--cat-skills)', 'var(--cat-health)', 'var(--cat-wealth)', 'var(--cat-mind)', 'var(--cat-relationships)', 'var(--line-blue)'],
}
