'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DatabaseBackup } from 'lucide-react'
import { backupNowAction } from '@/app/actions'
import { Button } from '../button'
import { useToast } from '../toast'

/**
 * Asks the worker to run the `backup` job, then re-reads the page every 2 seconds (for at most a minute) until a new file
 * shows up. `action` is injectable so /dev/ui never starts a real backup.
 */
export function BackupNowButton({ disabled, running, lastName, action = backupNowAction }: {
  disabled?: boolean; running?: boolean; lastName: string | null
  action?: () => Promise<{ ok: boolean; error?: string }>
}) {
  const router = useRouter()
  const toast = useToast()
  const [waiting, setWaiting] = useState(false)
  const startName = useRef(lastName)
  const since = useRef(0)

  // While waiting, ask the server for fresh numbers; stop when the newest file changed or a minute passed.
  useEffect(() => {
    if (!waiting) return
    if (lastName !== startName.current) { setWaiting(false); toast('Backup saved', 'good'); return }
    const t = setInterval(() => {
      if (Date.now() - since.current > 60_000) { setWaiting(false); toast('Still running. This page updates when it finishes.'); return }
      router.refresh()
    }, 2000)
    return () => clearInterval(t)
  }, [waiting, lastName, router, toast])

  const busy = waiting || !!running
  return (
    <Button
      variant="secondary" disabled={disabled || busy}
      onClick={async () => {
        // The demo gate refuses the action by rejecting it: toast.error() then shows the one demo message.
        const r = await action().catch(() => ({ ok: false as const, error: undefined }))
        if (!r.ok) return toast.error(r.error ?? 'Could not start the backup.')
        startName.current = lastName
        since.current = Date.now()
        setWaiting(true)
      }}
    >
      <DatabaseBackup className="size-4" strokeWidth={1.5} aria-hidden />{busy ? 'Backing up…' : 'Back up now'}
    </Button>
  )
}
