'use client'

import { useState, useTransition } from 'react'
import brand from '@relife/brand/brand.json'
import { Undo2 } from 'lucide-react'
import { isDataItem, type NeedsYouItem } from '@/domain/needs-you'
import { Button } from '../button'
import { Fold } from '../fold'
import { RetryAll } from '../raw-event-actions'
import { useToast } from '../toast'
import { usePeekChanged } from '../peek/peek-context'
import { NeedsYouRow, sortSummary, type RowCtx } from './needs-you-row'
import { ResolvedItem } from './queue-item'

/** `data`: the item was a data item (To sort), kept here because `items` loses it on the next refresh. */
type Resolved = { text: string; index: number; data: boolean; undo?: () => Promise<unknown>; undoing?: boolean }

/**
 * The queue. An action collapses its row in place to "✓ what happened · Undo" at once (a static cue, no motion needed)
 * and leaves the list on the next refresh. If the action throws, the row comes back with an error toast. The page
 * re-keys this list when the filter changes, so a collapsed row never shows up under the wrong filter.
 */
export function NeedsYouList({ items, timezone, today, categories, goal, connections, openSort = false }: Pick<RowCtx, 'timezone' | 'today' | 'categories' | 'goal' | 'connections'> & { items: NeedsYouItem[]; /** Open the To sort fold (the Data filter). */ openSort?: boolean }) {
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
    timezone, today, categories, goal, connections,
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
  const isData = (r: typeof rows[number]) => ('item' in r ? isDataItem(r.item) : r.r.data)
  const decisions = rows.filter((r) => !isData(r))
  const toSort = rows.filter(isData)
  const open = (r: typeof rows[number]) => 'item' in r

  const resolvedRow = (r: { id: string; r: Resolved }) => (
    <li key={r.id}>
      <ResolvedItem
        text={r.r.text}
        undo={r.r.undo ? (
          <Button size="sm" variant="quiet" disabled={r.r.undoing} onClick={() => void undo(r.id, r.r.undo!)}><Undo2 className="size-3.5" strokeWidth={1.5} aria-hidden />Undo</Button>
        ) : undefined}
      />
    </li>
  )
  const sortItems = toSort.flatMap((r) => ('item' in r && (r.item.kind === 'unread' || r.item.kind === 'categorise') ? [r.item] : []))

  return (
    <>
      {decisions.length ? (
        <section aria-labelledby="needs-decisions">
          <div className="flex items-baseline justify-between gap-4 pt-1 pb-2">
            <h3 id="needs-decisions" className="text-small font-medium text-ink-2">Decisions <span className="ml-1 font-normal text-ink-3 tabular-nums">{decisions.filter(open).length}</span></h3>
            <p className="text-small text-ink-3">Most urgent first</p>
          </div>
          <ul className="flex flex-col divide-y divide-divider border-t border-divider">
            {decisions.map((r) => 'item' in r ? <li key={r.item.id}><NeedsYouRow item={r.item} ctx={ctx} /></li> : resolvedRow(r))}
          </ul>
        </section>
      ) : null}
      {toSort.length ? (
        <Fold
          defaultOpen={openSort}
          className="border-t border-divider first:border-t-0"
          title={<>To sort <span className="ml-1 font-normal text-ink-3 tabular-nums">{toSort.filter(open).length}</span></>}
          summary={sortItems.length ? sortSummary(sortItems) : undefined}
        >
          <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-4 pb-1 text-small text-ink-3">
            <span>Pick once and {brand.name} files the next ones itself.</span>
            {unread.length > 1 ? <RetryAll ids={unread.flatMap((u) => u.rawEventIds)} /> : null}
          </div>
          <ul className="flex flex-col divide-y divide-divider border-t border-divider">
            {toSort.map((r) => ('item' in r ? <li key={r.item.id}><NeedsYouRow item={r.item} ctx={ctx} /></li> : resolvedRow(r)))}
          </ul>
        </Fold>
      ) : null}
    </>
  )
}
