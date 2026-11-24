'use client'

import { useEffect, useRef, useState } from 'react'
import { delayedShow } from '@/domain/delayed-show'

/**
 * `true` while a loader should be on screen for a wait (`active`): after `delay` ms, never for a wait that ends sooner,
 * and for at least `minVisible` ms once shown. The timing rules are `delayedShow` in the domain.
 */
export function useDelayedShow(active: boolean, delay = 300, minVisible = 0) {
  const [visible, setVisible] = useState(false)
  const wait = useRef<{ startedAt: number; endedAt: number | null } | null>(null)

  useEffect(() => {
    const now = performance.now()
    if (active && wait.current?.endedAt !== null) wait.current = { startedAt: now, endedAt: null }
    else if (!active && wait.current?.endedAt === null) wait.current.endedAt = now
    let timer: ReturnType<typeof setTimeout> | undefined
    const check = () => {
      if (!wait.current) return
      const next = delayedShow({ ...wait.current, now: performance.now(), delay, minVisible })
      setVisible(next.visible)
      if (next.recheckIn != null) timer = setTimeout(check, next.recheckIn)
    }
    timer = setTimeout(check, 0)
    return () => clearTimeout(timer)
  }, [active, delay, minVisible])

  return visible
}
