'use client'

import { useState, useTransition } from 'react'
import { Undo2 } from 'lucide-react'
import type { NeedsYouItem } from '@/domain/needs-you'
import { Button } from '../button'
import { RetryAll } from '../raw-event-actions'
import { useToast } from '../toast'
import { usePeekChanged } from '../peek/peek-context'
import { NeedsYouRow, type RowCtx } from './needs-you-row'
import { ResolvedItem } from './queue-item'

type Resolved = { text: string; index: number; undo?: () => Promise<unknown>; undoing?: boolean }

/**
 * The queue. An action collapses its row in place to "✓ what happened · Undo" at once (a static cue, no motion needed)
 * and leaves the list on the next refresh. If the action throws, the row comes back with an error toast. The page
 * re-keys this list when the filter changes, so a collapsed row never shows up under the wrong filter.
 */
export function NeedsYouList({ items, timezone, today, categories, goal }: Pick<RowCtx, 'timezone' | 'today' | 'categories' | 'goal'> & { items: NeedsYouItem[] }) {
  const [resolved, setResolved] = useState<Map<string, Resolved>>(new Map())
  const [, start] = useTransition()
  const toast = useToast()
  const changed = usePeekChanged()

  const live = items.filter((i) => !resolved.has(i.id))
  const rows: ({ item: NeedsYouItem } | { id: string; r: Resolved })[] = live.map((item) => ({ item }))
  for (const [id, r] of [...resolved].sort((a, b) => a[1].index - b[1].index)) rows.splice(Math.min(r.index, rows.length), 0, { id, r })

  const put = (id: string, r: Omit<Resolved, 'index'>) => setResolved((m) => new Map(m).set(id, { ...r, index: Math.max(0, items.findIndex((i) => i.id === id)) }))
  const drop = (id: string) => setResolved((m) => { const n = new Map(m); n.delete(id); return n })

  const undo = async (id: string, fn: () => Promise<unknown>) => {
    setResolved((m) => { const r = m.get(id); return r ? new Map(m).set(id, { ...r, undoing: true }) : m })
    try { await fn(); changed(); drop(id) } catch { drop(id); toast.error('Couldn’t undo that', 'Refresh and try again.') }
  }

  const ctx: RowCtx = {
    timezone, today, categories, goal,
    done: (id, text) => put(id, { text }),
    act: (id, text, action, undoFn) => {
      put(id, { text, undo: undoFn })
      if (undoFn) toast(text, 'neutral', { action: { label: 'Undo', onClick: () => void undo(id, undoFn) } })
      start(async () => {
        try { await action(); changed() } catch { drop(id); toast.error() }
      })
    },
  }

  const unread = items.filter((i): i is Extract<NeedsYouItem, { kind: 'unread' }> => i.kind === 'unread' && !resolved.has(i.id))

  return (
    <>
      {unread.length > 1 ? (
        <div className="flex justify-end px-5 py-2">
          <RetryAll ids={unread.flatMap((u) => u.rawEventIds)} />
        </div>
      ) : null}
      <ul className="flex flex-col divide-y divide-divider border-t border-divider">
        {rows.map((r) => 'item' in r ? (
          <li key={r.item.id}><NeedsYouRow item={r.item} ctx={ctx} /></li>
        ) : (
          <li key={r.id}>
            <ResolvedItem
              text={r.r.text}
              undo={r.r.undo ? (
                <Button size="sm" variant="ghost" disabled={r.r.undoing} onClick={() => void undo(r.id, r.r.undo!)}><Undo2 className="size-3.5" strokeWidth={1.5} aria-hidden />Undo</Button>
              ) : undefined}
            />
          </li>
        ))}
      </ul>
    </>
  )
}
