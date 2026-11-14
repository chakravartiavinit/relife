'use client'

import { Share2 } from 'lucide-react'
import type { ShareKind } from '@/domain/share-card'
import { Button } from '../button'
import { openShareCard } from './share-event'

/**
 * Opens the share dialog for one card. With children it is a text button (secondary), without it a ghost icon button
 * named by `label`. `refId` is the level number, achievement key or week start, as `openShareCard` takes it.
 */
export function ShareButton({ kind, refId, label, children, className }: { kind: ShareKind; refId?: string; label: string; children?: React.ReactNode; className?: string }) {
  return children ? (
    <Button size="sm" className={className} onClick={() => openShareCard(kind, refId)}><Share2 className="size-4" strokeWidth={1.5} aria-hidden />{children}</Button>
  ) : (
    <Button variant="ghost" size="icon-sm" className={className} aria-label={label} title={label} onClick={() => openShareCard(kind, refId)}><Share2 className="size-4" strokeWidth={1.5} aria-hidden /></Button>
  )
}
