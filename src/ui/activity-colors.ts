import type { ActivityKind } from '@/domain/activity'

/** One colour per kind of time, shared by the Activity page, library cards and the site picker. */
export const KIND_COLOR: Record<ActivityKind, string> = {
  learning: 'var(--cat-skills)', work: 'var(--pill)', entertainment: 'var(--cat-health)', social: 'var(--cat-mind)',
  communication: 'var(--cat-relationships)', shopping: 'var(--cat-wealth)', news: 'var(--cat-hobbies)', other: 'var(--ink-3)',
}
