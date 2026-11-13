'use client'

import { useSyncExternalStore } from 'react'
import { LIFE_KEY, SIDEBAR_KEY } from './sidebar-script'

// The sidebar's two remembered choices live on <html> (`data-sidebar`, `data-life`), set by SIDEBAR_SCRIPT before
// paint. React reads them from there, so server and first client render agree (expanded) and the real state arrives
// right after hydration, while CSS already drew the saved layout.

const EVENT = 'relife:sidebar'
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb)
  window.addEventListener('storage', cb)
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener('storage', cb) }
}

function flag(attr: 'sidebar' | 'life', key: string, on: string, off: string) {
  const set = (value: boolean) => {
    document.documentElement.dataset[attr] = value ? on : off
    try { localStorage.setItem(key, value ? on : off) } catch { /* private mode: it just will not be remembered */ }
    window.dispatchEvent(new Event(EVENT))
  }
  return { subscribe, get: () => document.documentElement.dataset[attr] === on, server: () => false, set }
}

const rail = flag('sidebar', SIDEBAR_KEY, 'rail', 'expanded')
const closed = flag('life', LIFE_KEY, 'closed', 'open')

/** `[isRail, setRail]`: the sidebar collapsed to its 72px icon rail. */
export function useSidebarRail() {
  return [useSyncExternalStore(rail.subscribe, rail.get, rail.server), rail.set] as const
}

/** `[lifeOpen, setLifeOpen]`: the Life group's area list is unfolded. */
export function useLifeOpen() {
  return [!useSyncExternalStore(closed.subscribe, closed.get, closed.server), (open: boolean) => closed.set(!open)] as const
}
