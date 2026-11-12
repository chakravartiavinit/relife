import { BellRing, CalendarRange, Lightbulb, Target } from 'lucide-react'

/** Each kind of insight has its own icon and colour, so a long queue scans by shape before words. */
export const KIND = {
  alert: { label: 'Alert', plural: 'Alerts', icon: BellRing, color: 'var(--warn)' },
  nudge: { label: 'Nudge', plural: 'Nudges', icon: Lightbulb, color: 'var(--pill)' },
  review: { label: 'Weekly review', plural: 'Reviews', icon: CalendarRange, color: 'var(--cat-mind)' },
  plan: { label: 'Plan', plural: 'Plans', icon: Target, color: 'var(--good)' },
} as const
export type InsightKind = keyof typeof KIND
export const isKind = (v: unknown): v is InsightKind => typeof v === 'string' && v in KIND

export const STATUS: Record<string, { label: string; color?: string }> = {
  accepted: { label: 'Accepted', color: 'var(--good)' },
  done: { label: 'Done', color: 'var(--good)' },
  dismissed: { label: 'Dismissed' },
}
