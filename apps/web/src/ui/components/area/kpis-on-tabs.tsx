'use client'

import { useSelectedLayoutSegment } from 'next/navigation'

/** Renders its children on the tabs after Overview (`/health/trends`), not on the Overview itself, where the targets table carries the same numbers. */
export function OnTabs({ children }: { children: React.ReactNode }) {
  return useSelectedLayoutSegment() === null ? null : children
}
