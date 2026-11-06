'use client'

import { useTransition } from 'react'
import { RefreshCw } from 'lucide-react'
import { ignoreRawEvent, retryRawEvent } from '@/app/actions'
import { Button } from './button'
import { useToast } from './toast'

export function RawEventActions({ id, retryOnly }: { id: string; retryOnly?: boolean }) {
  const [pending, start] = useTransition()
  const toast = useToast()
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button size="sm" disabled={pending} onClick={() => start(async () => { await retryRawEvent(id); toast('Retried', 'good') })}>
        <RefreshCw className={pending ? 'size-3.5 animate-spin' : 'size-3.5'} strokeWidth={1.5} /> Retry
      </Button>
      {!retryOnly ? (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { await ignoreRawEvent(id) })}>
          Ignore
        </Button>
      ) : null}
    </div>
  )
}
