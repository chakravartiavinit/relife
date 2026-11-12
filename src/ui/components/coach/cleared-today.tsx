'use client'

import { useState, useTransition } from 'react'
import { Check, Undo2 } from 'lucide-react'
import Link from 'next/link'
import { restoreInsight } from '@/app/actions'
import type { ClearedItem } from '@/core/needs-you'
import { formatTime } from '@/core/time'
import { Button } from '../button'
import { useToast } from '../toast'
import { QUEUE_KIND } from './kinds'
import type { NeedsYouKind } from '@/domain/needs-you'

/** "Cleared today" under All caught up: what was done, newest first, with Undo while a dismiss can still be taken back. */
export function ClearedToday({ items, timezone }: { items: ClearedItem[]; timezone: string }) {
  const [undone, setUndone] = useState<Set<string>>(new Set())
  const [pending, start] = useTransition()
  const toast = useToast()
  if (!items.length) return null
  const undo = (id: string) => start(async () => {
    try {
      const r = await restoreInsight(id)
      if (r.ok) setUndone((s) => new Set(s).add(id))
      else toast('Too late to undo', 'neutral', { description: 'It was dismissed more than 10 minutes ago.' })
    } catch { toast.error() }
  })
  return (
    <section aria-labelledby="cleared-h" className="px-5 pb-5">
      <div className="flex items-center justify-between">
        <h3 id="cleared-h" className="font-mono text-label uppercase text-ink-3">Cleared today</h3>
        <Link href="/coach/history" className="inline-flex h-8 items-center text-small font-medium text-pill-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill">All history</Link>
      </div>
      <ul className="mt-2 flex flex-col divide-y divide-divider border-t border-divider">
        {items.map((c) => {
          const gone = undone.has(c.id)
          const kind = QUEUE_KIND[c.kind as NeedsYouKind]
          return (
            <li key={c.id} className="flex items-center gap-3 py-3">
              <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-good/10 text-good"><Check className="size-4" strokeWidth={2} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-body font-medium text-ink text-pretty">{gone ? 'Back in Needs you' : c.line}</p>
                <p className="text-small text-ink-3 tabular-nums">{kind?.label ?? c.kind} · {formatTime(new Date(c.at), timezone)}</p>
              </div>
              {c.undo && !gone ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => undo(c.id)}><Undo2 className="size-3.5" strokeWidth={1.5} aria-hidden />Undo</Button> : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
