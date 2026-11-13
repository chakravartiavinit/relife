'use client'

import { useEffect, useSyncExternalStore } from 'react'
import type { CapturePayload } from '@/domain/capture'
import { DATA_CHANGED } from '../live-refresh'

// Capture's suggestions, fetched from /api/capture. One copy for the whole page: the top-bar field and the tab-bar
// `+` start the fetch on pointer-enter/focus (`prefetchCapture`), so by the time Capture opens it is usually
// there. It is kept until new data lands (`relife:data-changed`), one of Capture's own actions runs, or 30 s pass
// (the "due now" list depends on the clock). A stale copy still shows while the fresh one loads.

export const CAPTURE_EVENT = 'relife:command'
const TTL_MS = 30_000

export type CaptureState = { data: CapturePayload | null; status: 'loading' | 'ready' | 'error' }

let state: CaptureState = { data: null, status: 'loading' }
let fetchedAt = 0
let stale = true
let inflight: Promise<void> | null = null
const subs = new Set<() => void>()
const set = (s: CaptureState) => { state = s; subs.forEach((f) => f()) }

/** Opens Capture. `text` is the first character typed into the top-bar field, carried into the input. */
export function openCapture(text?: string) {
  window.dispatchEvent(new CustomEvent(CAPTURE_EVENT, { detail: { text } }))
}

/** Marks the copy as out of date: the next open fetches again. */
export function invalidateCapture() { stale = true }

export function prefetchCapture() {
  if (inflight || (!stale && state.data && Date.now() - fetchedAt < TTL_MS)) return inflight ?? Promise.resolve()
  if (!state.data) set({ data: null, status: 'loading' })
  return (inflight = fetch('/api/capture', { cache: 'no-store' })
    .then((r) => (r.ok ? (r.json() as Promise<CapturePayload>) : Promise.reject(new Error(String(r.status)))))
    .then((data) => { fetchedAt = Date.now(); stale = false; set({ data, status: 'ready' }) })
    .catch(() => set({ data: state.data, status: state.data ? 'ready' : 'error' }))
    .finally(() => { inflight = null }))
}

if (typeof window !== 'undefined') window.addEventListener(DATA_CHANGED, invalidateCapture)

/** The suggestions; fetches (or refreshes) when `open` turns true. */
export function useCaptureData(open: boolean): CaptureState & { retry: () => void } {
  const s = useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb) } }, () => state, () => state)
  useEffect(() => { if (open) void prefetchCapture() }, [open])
  return { ...s, retry: () => { stale = true; void prefetchCapture() } }
}
