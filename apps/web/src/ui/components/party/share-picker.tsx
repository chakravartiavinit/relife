'use client'

import { ShieldCheck } from 'lucide-react'
import { PARTY_SHARE_KEYS, type PartyShare } from '@relife/contract'
import { Checkbox } from '@/ui/beui/motion/checkbox'

const ROWS: Record<(typeof PARTY_SHARE_KEYS)[number], { label: string; hint: string }> = {
  name: { label: 'My name', hint: 'Otherwise you show as “A member”.' },
  level: { label: 'My level and title', hint: 'For example Level 12, Adept.' },
  streak: { label: 'My show-up streak', hint: 'Days in a row you did something on purpose.' },
  today: { label: 'How today is going', hint: 'Routines done out of routines due, as a count. Never their names.' },
  quests: { label: 'Weekly quest progress', hint: 'One percentage per quest.' },
  achievements: { label: 'Achievements this week', hint: 'Just the names of what you unlocked.' },
}

/**
 * What a person lets their party see: six ticks, each its own. Used when starting a party, accepting an invitation and any
 * time after (“What I share”). Whether you are on track for the party quest counts whatever you tick, so the quest still works
 * for someone who keeps everything else private.
 */
export function SharePicker({ value, onChange, disabled }: { value: PartyShare; onChange: (next: PartyShare) => void; disabled?: boolean }) {
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-3">
      <legend className="sr-only">What the others in this party can see</legend>
      {PARTY_SHARE_KEYS.map((k) => (
        <Checkbox key={k} checked={value[k]} disabled={disabled} onCheckedChange={(on) => onChange({ ...value, [k]: on })} label={ROWS[k].label} description={ROWS[k].hint} />
      ))}
      <p className="mt-1 flex items-start gap-2 text-caption leading-relaxed text-ink-3">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
        <span>Never shared: values, health numbers, money, routine names, notes, goals, Coach or your connected services. Everyone sees the same list.</span>
      </p>
    </fieldset>
  )
}
