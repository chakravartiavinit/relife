import { BellRing, CalendarRange, Lightbulb, Target } from 'lucide-react'

/** Each kind of insight has its own icon and colour, so a long queue scans by shape before words. */
export const KIND = {
  alert: { label: 'Alert', icon: BellRing, color: 'var(--warn)' },
  nudge: { label: 'Nudge', icon: Lightbulb, color: 'var(--pill)' },
  review: { label: 'Weekly review', icon: CalendarRange, color: 'var(--cat-mind)' },
  plan: { label: 'Plan', icon: Target, color: 'var(--good)' },
} as const

export const STATUS: Record<string, { label: string; color?: string }> = {
  accepted: { label: 'Accepted', color: 'var(--good)' },
  done: { label: 'Done', color: 'var(--good)' },
  dismissed: { label: 'Dismissed' },
}
