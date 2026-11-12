'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { CircleSlash, RotateCw } from 'lucide-react'
import type { PeekData } from '@/core/peek/types'
import { PEEK_PARAM, parsePeek, peekParam, type PeekRef, type PeekType } from '@/domain/peek'
import { Button } from '../button'
import { invalidateCapture } from '../capture/capture-data'
import { DATA_CHANGED } from '../live-refresh'
import { Sheet } from '../sheet'
import { PeekChangedProvider } from './peek-context'
import { closePeek } from './peek-link'
import { PeekSkeleton } from './peek-parts'
import { PeekView, peekHeading } from './peek-view'

/**
 * The Peek drawer (laptop) or sheet (phone), driven by `?peek=type:id`. Mounted once in the root layout, inside
 * Suspense (`useSearchParams`). Opening is a History API call (PeekLink), so nothing goes to the server except
 * this one fetch of `/api/peek`. It fetches again when new data lands or something changes inside the peek.
 */
export function PeekHost() {
  const params = useSearchParams()
  const ref = parsePeek(params.get(PEEK_PARAM))
  const key = ref ? peekParam(ref) : null
  // The last open item stays drawn while the sheet slides out, so closing never flashes an empty panel.
  const last = useRef<PeekRef | null>(null)
  if (ref) last.current = ref
  const shown = ref ?? last.current

  const { view, reload } = usePeekData(key)
  const changed = useCallback(() => { invalidateCapture(); reload() }, [reload])
  useSourceRing(key)

  if (!shown) return null
  const data = view?.data
  const heading = data ? peekHeading(data) : { title: TYPE_LABEL[shown.type] }
  return (
    <Sheet
      open={!!ref} onOpenChange={(o) => { if (!o) closePeek() }}
      title={heading.title} description={heading.description} icon={heading.icon}
      snapPoints={[0.62, 0.92]}
    >
      <PeekChangedProvider value={changed}>
        {data ? <PeekView key={key} data={data} /> : view?.status === 'gone' ? <Gone onClose={closePeek} /> : view?.status === 'error' ? <Failed onRetry={reload} /> : <PeekSkeleton />}
      </PeekChangedProvider>
    </Sheet>
  )
}

const TYPE_LABEL: Record<PeekType, string> = {
  metric: 'Metric', routine: 'Routine', goal: 'Goal', txn: 'Payment', merchant: 'Merchant', insight: 'Coach', connector: 'Connection', person: 'Person', quest: 'Quest', sync: 'Sync status', brief: 'Summary',
}

export function Gone({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <CircleSlash className="size-6 text-ink-3" strokeWidth={1.5} aria-hidden />
      <p className="text-heading text-ink">This item is gone</p>
      <p className="max-w-[32ch] text-small text-ink-3">It was deleted or never existed. Nothing here to show.</p>
      <Button onClick={onClose}>Close</Button>
    </div>
  )
}

export function Failed({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <p className="text-heading text-ink">Couldn’t load this</p>
      <p className="max-w-[32ch] text-small text-ink-3">Check that the app is running, then try again.</p>
      <Button onClick={onRetry}><RotateCw className="size-4" strokeWidth={1.5} aria-hidden />Retry</Button>
    </div>
  )
}

type View = { key: string; status: 'ready' | 'gone' | 'error'; data: PeekData | null }
/** Last good payload per item, so opening one again (or swapping back) shows it at once while it refreshes. */
const cache = new Map<string, PeekData>()

/** Fetches the item. Stale data shows while a fresh copy loads; `reload` fetches again without a loading state. */
function usePeekData(key: string | null) {
  const [view, setView] = useState<View | null>(null)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!key) return
    const ctl = new AbortController()
    fetch(`/api/peek?ref=${encodeURIComponent(key)}`, { signal: ctl.signal, cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 404) { cache.delete(key); setView({ key, status: 'gone', data: null }); return }
        if (!r.ok) throw new Error(String(r.status))
        const data = (await r.json()) as PeekData
        cache.set(key, data)
        setView({ key, status: 'ready', data })
      })
      .catch((e: unknown) => { if (!(e instanceof DOMException && e.name === 'AbortError')) setView((v) => (v?.key === key && v.data ? v : { key, status: 'error', data: null })) })
    return () => ctl.abort()
  }, [key, tick])

  useEffect(() => {
    if (!key) return
    window.addEventListener(DATA_CHANGED, reload)
    return () => window.removeEventListener(DATA_CHANGED, reload)
  }, [key, reload])

  // Derived, so swapping items never shows the previous item's data: this key's fetch result, else its cached copy.
  const cached = key ? cache.get(key) : undefined
  const current = view && view.key === key ? view : null
  return { view: current ?? (cached ? { key: key!, status: 'ready' as const, data: cached } : null), reload }
}

/** The element that opened the peek gets a 2px pill ring (`[data-peek-open]` in globals.css) while it is open. */
function useSourceRing(key: string | null) {
  useEffect(() => {
    if (!key) return
    const els = [...document.querySelectorAll<HTMLElement>(`[data-peek="${key.replace(/["\\]/g, '\\$&')}"]`)]
    for (const el of els) el.setAttribute('data-peek-open', '')
    return () => { for (const el of els) el.removeAttribute('data-peek-open') }
  }, [key])
}

