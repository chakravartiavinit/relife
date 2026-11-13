import { PeekLink } from '../peek/peek-link'
import type { SyncTone } from '@/domain/shell'
import { cn } from '../../cn'

const TONE: Record<SyncTone | 'loading', string> = { good: 'var(--good)', warn: 'var(--warn)', bad: 'var(--bad)', loading: 'var(--ink-3)' }

/**
 * Is data flowing? A dot (green: all synced, amber: a connector failing, red: the worker is offline) and, on a
 * laptop, the plain-words status. Opens the sync Peek (connectors, last run, the fix).
 */
export function SyncDot({ tone, label, className }: { tone: SyncTone | 'loading'; label?: string; className?: string }) {
  return (
    <PeekLink
      to={{ type: 'sync', id: 'status' }}
      aria-label={label ? `Sync status: ${label}. Open details` : 'Sync status'}
      title={label}
      className={cn('relative inline-flex h-10 items-center gap-2 rounded-full px-3 text-caption text-ink-3 transition-[background-color,color] duration-150 ease-out-quint hover:bg-surface-2 hover:text-ink-2 focus-visible:outline-2 focus-visible:outline-pill', className)}
    >
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ background: TONE[tone], boxShadow: `0 0 0 3px color-mix(in oklch, ${TONE[tone]} 18%, transparent)` }}
      />
      {label ? <span className="hidden whitespace-nowrap tabular-nums xl:inline">{label}</span> : null}
    </PeekLink>
  )
}
