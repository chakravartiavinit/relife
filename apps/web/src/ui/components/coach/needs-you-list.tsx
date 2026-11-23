'use client'

import { useState, useTransition } from 'react'
import brand from '@relife/brand/brand.json'
import { ChevronRight, Undo2 } from 'lucide-react'
import { isDataItem, type NeedsYouItem } from '@/domain/needs-you'
import { Button } from '../button'
import { IconChip } from '../card'
import { RetryAll } from '../raw-event-actions'
import { useToast } from '../toast'
import { usePeekChanged } from '../peek/peek-context'
import { QUEUE_KIND } from './kinds'
import { NeedsYouRow, sortSummary, type RowCtx } from './needs-you-row'
import { ResolvedItem } from './queue-item'

/** `data`: the item was a data item (To sort), kept here because `items` loses it on the next refresh. */
type Resolved = { text: string; index: number; data: boolean; undo?: () => Promise<unknown>; undoing?: boolean }

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

  const put = (id: string, r: Omit<Resolved, 'index' | 'data'>) => {
    const index = items.findIndex((i) => i.id === id)
    setResolved((m) => new Map(m).set(id, { ...r, index: Math.max(0, index), data: index >= 0 && isDataItem(items[index]) }))
  }
  const drop = (id: string) => setResolved((m) => { const n = new Map(m); n.delete(id); return n })

  const undo = async (id: string, fn: () => Promise<unknown>) => {
    setResolved((m) => { const r = m.get(id); return r ? new Map(m).set(id, { ...r, undoing: true }) : m })
    try {
      const res = await fn()
      // restoreInsight answers { ok: false } after its 10-minute window: the item stays handled, so keep the row.
      if (res && typeof res === 'object' && 'ok' in res && !res.ok) throw new Error('not restored')
      changed(); drop(id)
    } catch {
      setResolved((m) => { const r = m.get(id); return r ? new Map(m).set(id, { ...r, undoing: false }) : m })
      toast.error('Too late to undo', 'It stays handled. Find it in History.')
    }
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
  const isData = (r: typeof rows[number]) => 'item' in r ? isDataItem(r.item) : r.r.data
  const decisions = rows.filter((r) => !isData(r))
  const toSort = rows.filter(isData)
  const open = (r: typeof rows[number]) => 'item' in r

  const resolvedRow = (r: { id: string; r: Resolved }) => (
    <li key={r.id}>
      <ResolvedItem
        text={r.r.text}
        undo={r.r.undo ? (
          <Button size="sm" variant="ghost" disabled={r.r.undoing} onClick={() => void undo(r.id, r.r.undo!)}><Undo2 className="size-3.5" strokeWidth={1.5} aria-hidden />Undo</Button>
        ) : undefined}
      />
    </li>
  )

  return (
    <>
      {decisions.length ? (
        <section aria-labelledby="needs-decisions">
          <GroupHead id="needs-decisions" title="Decisions" count={decisions.filter(open).length} />
          <ul className="flex flex-col divide-y divide-divider border-t border-divider">
            {decisions.map((r) => 'item' in r ? <li key={r.item.id}><NeedsYouRow item={r.item} ctx={ctx} /></li> : resolvedRow(r))}
          </ul>
        </section>
      ) : null}
      {toSort.length ? (
        <section aria-labelledby="needs-to-sort">
          <GroupHead id="needs-to-sort" title="To sort" count={toSort.filter(open).length}
            hint={<><span className="max-sm:hidden">Pick once and {brand.name} files the next ones itself.</span><span className="sm:hidden">Tap one to sort it</span></>}
            action={unread.length > 1 ? <RetryAll ids={unread.flatMap((u) => u.rawEventIds)} /> : null} />
          <ul className="flex flex-col divide-y divide-divider border-t border-divider">
            {toSort.map((r) => 'item' in r ? (
              <li key={r.item.id}>
                {/* A phone folds each data item to one line; from 640px of page width the row is always open. */}
                <details data-fold-inline className="group/sort">
                  <FoldLine item={r.item as Extract<NeedsYouItem, { kind: 'unread' | 'categorise' }>} ctx={ctx} />
                  <NeedsYouRow item={r.item} ctx={ctx} />
                </details>
              </li>
            ) : resolvedRow(r))}
          </ul>
        </section>
      ) : null}
    </>
  )
}

/** The title row of a group: its name and count, a hint, and one group action (Retry all). */
function GroupHead({ id, title, count, hint, action }: { id: string; title: string; count: number; hint?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <header className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 border-t border-divider px-5 py-1">
      <h3 id={id} className="text-small font-medium text-ink-2">{title} <span className="ml-1 font-normal text-ink-3 tabular-nums">{count}</span></h3>
      <div className="flex min-w-0 items-center gap-2 text-small text-ink-3">{hint}{action}</div>
    </header>
  )
}

function FoldLine({ item, ctx }: { item: Extract<NeedsYouItem, { kind: 'unread' | 'categorise' }>; ctx: RowCtx }) {
  const k = QUEUE_KIND[item.kind]
  const { title, line } = sortSummary(item, ctx)
  return (
    <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3.5 px-5 py-2 transition-colors duration-150 ease-out-quint hover-fine:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pill [&::-webkit-details-marker]:hidden">
      <IconChip color={k.color} className="size-9 rounded-[12px] [&_svg]:size-[18px]"><k.icon strokeWidth={1.5} /></IconChip>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-medium text-ink">{title}</span>
        <span className="block truncate text-small text-ink-3 tabular-nums">{line}</span>
      </span>
      <ChevronRight aria-hidden strokeWidth={1.5} className="size-4 shrink-0 text-ink-3 transition-transform duration-150 ease-out-quint group-open/sort:rotate-90 motion-reduce:transition-none" />
    </summary>
  )
}
