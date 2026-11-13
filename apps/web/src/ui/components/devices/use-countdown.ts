'use client'

import { useEffect, useState } from 'react'

/** Seconds left until an ISO time, ticking once a second (null before the first client render, so server and client agree). */
export function useCountdown(until: string | null) {
  const [left, setLeft] = useState<number | null>(null)
  useEffect(() => {
    if (!until) { setLeft(null); return }
    const t = new Date(until).getTime()
    const tick = () => setLeft(Math.max(0, Math.ceil((t - Date.now()) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [until])
  return left
}

/** `4:12` */
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/** "just now", "2 min ago", "3 h ago", "12 days ago". */
export function ago(iso: string | null, now = Date.now()) {
  if (!iso) return 'never'
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`
  const d = Math.round(s / 86_400)
  return `${d} ${d === 1 ? 'day' : 'days'} ago`
}
