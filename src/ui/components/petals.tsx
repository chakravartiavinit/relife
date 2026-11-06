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

  if (!show) return null
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
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
            animation: `relife-fall ${1.8 + (i % 4) * 0.2}s cubic-bezier(0.2,0,0,1) ${(i % 7) * 0.08}s both`,
            ['--dx' as string]: `${((i % 5) - 2) * 40}px`,
            ['--rot' as string]: `${(i % 2 ? 1 : -1) * (180 + i * 20)}deg`,
          }}
        />
      ))}
    </div>
  )
}
