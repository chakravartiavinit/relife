'use client'

import { MotionConfig } from 'motion/react'

/** Motion animations honour the OS "reduce motion" setting: transforms are skipped, fades kept. */
export function AppMotion({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}
