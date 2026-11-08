'use client'

import { useEffect, useState } from 'react'
import { Petal } from './line-art'

/**
 * A short, sparse sakura burst the first time a day is fully complete.
 * Rare by design: once per day (localStorage). Skipped under prefers-reduced-motion.
 */
export function PetalBurst({ complete, day }: { complete: boolean; day: string }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!complete) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const key = `relife:petals:${day}`
    if (localStorage.getItem(key)) return
    localStorage.setItem(key, '1')
    setShow(true)
    const t = setTimeout(() => setShow(false), 2600)
    return () => clearTimeout(t)
  }, [complete, day])

  return show ? <Petals /> : null
}

/** Plays the burst whenever a level-up or achievement fires `relife:celebrate`. Mounted once in the layout. */
export function Celebration() {
  const [run, setRun] = useState(0)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    const on = () => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
      setRun((n) => n + 1)
      clearTimeout(t)
      t = setTimeout(() => setRun(0), 2600)
    }
    window.addEventListener('relife:celebrate', on)
    return () => { window.removeEventListener('relife:celebrate', on); clearTimeout(t) }
  }, [])
  return run ? <Petals key={run} /> : null
}

/** Fourteen petals falling once, about 2.6s. Decorative only. */
function Petals() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      <style>{`
        @keyframes relife-fall {
          0% { transform: translate3d(0,-10vh,0) rotate(0deg); opacity: 0 }
          10% { opacity: 1 }
          100% { transform: translate3d(var(--dx), 105vh, 0) rotate(var(--rot)); opacity: 0 }
        }
      `}</style>
      {Array.from({ length: 14 }, (_, i) => (
        <Petal
          key={i}
          className="absolute top-0 size-3.5 will-change-transform"
          style={{
            left: `${(i * 37) % 100}%`,
            animation: `relife-fall ${1.8 + (i % 4) * 0.2}s linear ${(i % 7) * 0.08}s both`,
            ['--dx' as string]: `${((i % 5) - 2) * 40}px`,
            ['--rot' as string]: `${(i % 2 ? 1 : -1) * (180 + i * 20)}deg`,
          }}
        />
      ))}
    </div>
  )
}
