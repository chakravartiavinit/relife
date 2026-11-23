import { PeekLink } from '../peek/peek-link'
import type { SyncTone } from '@/domain/shell'
import { cn } from '../../cn'

const TONE: Record<SyncTone | 'loading', string> = { good: 'var(--good)', warn: 'var(--warn)', bad: 'var(--bad)', loading: 'var(--ink-3)' }

/**
 * Is data flowing? A dot (green: all synced, amber: a connector failing, red: the worker is offline). On its own it is a
 * 44px tap target (the phone top bar); `labelled` adds the plain-words status beside it, in the sidebar's foot, where
 * the 72px rail keeps only the dot. Opens the sync Peek (connectors, last run, the fix).
 */
export function SyncDot({ tone, label, labelled, className }: { tone: SyncTone | 'loading'; label?: string; labelled?: boolean; className?: string }) {
  return (
    <PeekLink
      to={{ type: 'sync', id: 'status' }}
      aria-label={label ? `Sync status: ${label}. Open details` : 'Sync status'}
      title={label}
      className={cn(
        'relative inline-flex items-center text-caption text-ink-3 transition-[background-color,color] duration-150 ease-out-quint hover-fine:bg-surface-2 hover-fine:text-ink-2 focus-visible:outline-2 focus-visible:outline-pill',
        labelled ? 'h-8 gap-2 rounded-md px-2 rail:w-8 rail:justify-center rail:px-0' : 'size-11 justify-center rounded-full',
        className,
      )}
    >
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: TONE[tone] }} />
      {labelled && label ? <span className="truncate tabular-nums rail:hidden">{label}</span> : null}
    </PeekLink>
  )
}
