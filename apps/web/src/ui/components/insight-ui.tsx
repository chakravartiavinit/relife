'use client'

import { useTransition } from 'react'
import { Check, Sparkles, X } from 'lucide-react'
import { resolveInsight } from '@/app/actions'
import { Button } from './button'
import { useToast } from './toast'
import { usePeekChanged } from './peek/peek-context'

export function InsightActions({ id, hasActions }: { id: string; hasActions: boolean }) {
  const [pending, start] = useTransition()
  const toast = useToast()
  const changed = usePeekChanged()
  const go = (d: 'accept' | 'dismiss') => start(async () => {
    await resolveInsight(id, d)
    changed()
    if (d === 'accept') toast(hasActions ? 'Added to your routines' : 'Insight noted', 'good', { icon: Sparkles })
    else toast('Insight dismissed', 'neutral', { icon: X })
  })
  return (
    <div className="flex items-center gap-2">
      {/* Approve changes your routines, so it is the strong button; "Got it" only files the card away. */}
      <Button size="sm" variant={hasActions ? 'primary' : 'secondary'} disabled={pending} onClick={() => go('accept')}>
        <Check className="size-4" strokeWidth={2} /> {hasActions ? 'Approve' : 'Got it'}
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => go('dismiss')}>
        <X className="size-4" strokeWidth={1.5} /> Dismiss
      </Button>
    </div>
  )
}
