'use client'

import { useState, useTransition } from 'react'
import { Undo2 } from 'lucide-react'
import Link from 'next/link'
import { restoreInsight } from '@/app/actions'
import type { ClearedItem } from '@/core/needs-you'
import { formatTime } from '@/core/time'
import { Button, buttonLinkClass } from '../button'
import { Fold } from '../fold'
import { Picture } from '../picture'
import { useToast } from '../toast'
import { QUEUE_KIND } from './kinds'
import { kindPicture } from './queue-picture'
import type { NeedsYouKind } from '@/domain/needs-you'

/** "Cleared today", folded under the queue: what was done, newest first, with Undo while a dismiss can still be taken back. */
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
    <Fold
      title="Cleared today" summary={`${items.length} ${items.length === 1 ? 'item' : 'items'}`}
      className="border-t border-divider first:border-t-0"
    >
      <ul className="flex flex-col divide-y divide-divider">
        {items.map((c) => {
          const gone = undone.has(c.id)
          const kind = QUEUE_KIND[c.kind as NeedsYouKind]
          return (
            <li key={c.id} className="flex items-center gap-3.5 py-3">
              <Picture {...kindPicture(c.kind, c.line)} size={32} />
              <div className="min-w-0 flex-1">
                <p className="text-body font-medium text-ink text-pretty">{gone ? 'Back in Needs you' : c.line}</p>
                <p className="text-small text-ink-3 tabular-nums">{kind?.label ?? c.kind} · {formatTime(new Date(c.at), timezone)}</p>
              </div>
              {c.undo && !gone ? <Button size="sm" variant="quiet" disabled={pending} onClick={() => undo(c.id)}><Undo2 className="size-3.5" strokeWidth={1.5} aria-hidden />Undo</Button> : null}
            </li>
          )
        })}
      </ul>
      <Link href="/coach/history" className={buttonLinkClass('mt-1 inline-flex min-h-10 items-center text-small')}>All history</Link>
    </Fold>
  )
}
