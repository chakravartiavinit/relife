'use client'

import { useTransition } from 'react'
import { RefreshCw, ScanText, X } from 'lucide-react'
import { ignoreRawEvent, retryRawEvents } from '@/app/actions'
import { Button } from './button'
import { useToast } from './toast'
import { cn } from '../cn'

/** Say how a retry came out, since the row may simply stay put. */
function useRetry() {
  const [pending, start] = useTransition()
  const toast = useToast()
  const retry = (ids: string[]) => start(async () => {
    const r = await retryRawEvents(ids)
    const many = ids.length > 1
    if (r.parsed) toast(many ? `${r.parsed} of ${ids.length} read and saved` : 'Read and saved', 'good', { icon: ScanText })
    else if (r.failed) toast(many ? `Still can’t read ${r.failed}` : 'Still can’t read it', 'neutral', { icon: ScanText, description: 'Nothing changed' })
    else toast('No reader recognised it', 'neutral', { icon: ScanText, description: 'Nothing changed' })
  })
  return { pending, retry }
}

export function RawEventActions({ id, dismiss = true }: { id: string; dismiss?: boolean }) {
  const { pending, retry } = useRetry()
  const [dismissing, startDismiss] = useTransition()
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button size="sm" disabled={pending || dismissing} onClick={() => retry([id])}>
        <RefreshCw className={cn('size-3.5', pending && 'animate-spin')} strokeWidth={1.5} aria-hidden />
        {pending ? 'Trying…' : 'Retry'}
      </Button>
      {dismiss ? (
        <Button size="icon-sm" variant="ghost" aria-label="Dismiss" title="Dismiss" disabled={pending || dismissing} onClick={() => startDismiss(async () => { await ignoreRawEvent(id) })}>
          <X className="size-4" strokeWidth={1.5} aria-hidden />
        </Button>
      ) : null}
    </div>
  )
}

export function RetryAll({ ids, label = 'Retry all' }: { ids: string[]; label?: string }) {
  const { pending, retry } = useRetry()
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => retry(ids)}>
      <RefreshCw className={cn('size-3.5', pending && 'animate-spin')} strokeWidth={1.5} aria-hidden />
      {pending ? 'Trying…' : label}
    </Button>
  )
}
