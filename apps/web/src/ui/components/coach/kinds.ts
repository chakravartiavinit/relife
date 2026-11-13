import { BellRing, CalendarRange, LifeBuoy, Lightbulb, MessageSquareWarning, Sparkles, Tag, Target, type LucideIcon } from 'lucide-react'
import type { NeedsYouKind } from '@/domain/needs-you'

/** Every kind in the Needs you queue has its own shape and colour, so a long list scans by icon before words. */
export const QUEUE_KIND: Record<NeedsYouKind, { label: string; icon: LucideIcon; color: string }> = {
  recovery: { label: 'Recovery', icon: LifeBuoy, color: 'var(--warn)' },
  alert: { label: 'Alert', icon: BellRing, color: 'var(--warn)' },
  review: { label: 'Weekly review', icon: CalendarRange, color: 'var(--cat-mind)' },
  'goal-draft': { label: 'Goal draft', icon: Target, color: 'var(--pill)' },
  plan: { label: 'Proposal', icon: Sparkles, color: 'var(--pill)' },
  nudge: { label: 'Nudge', icon: Lightbulb, color: 'var(--pill)' },
  unread: { label: 'Couldn’t read', icon: MessageSquareWarning, color: 'var(--bad)' },
  categorise: { label: 'Pick a category', icon: Tag, color: 'var(--cat-wealth)' },
}
