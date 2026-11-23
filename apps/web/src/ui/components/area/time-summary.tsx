import { connection } from 'next/server'
import { Suspense } from 'react'
import { laptopEnabled } from '@/core/activity'
import { extensionLastSeen } from '@/core/auth/devices'
import { getUser } from '@/core/user'
import { cn } from '../../cn'
import { PeekLink } from '../peek/peek-link'

/** "2 min ago", for when the extension last reached the app. */
export function ago(d: Date) {
  const m = Math.round((Date.now() - d.getTime()) / 60_000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`
}

/** When the extension last reached the app: the right side of Time's head, where the other areas have their level. Streams in under Suspense. */
export function TimeSummary() {
  return <Suspense fallback={<div className="ms-auto h-9 w-48 rounded-md bg-surface-2" />}><Seen /></Suspense>
}

async function Seen() {
  await connection()
  const user = await getUser()
  const [seen, enabled] = await Promise.all([extensionLastSeen(user.id), laptopEnabled(user.id)])
  // Green while it is reporting (it checks in every few minutes), neutral after a quiet hour, none when it never has.
  const fresh = !!seen && Date.now() - seen.getTime() < 60 * 60_000
  const text = seen ? `Extension seen ${ago(seen)}` : enabled ? 'Extension not seen yet' : 'Extension not connected'
  return (
    <PeekLink
      to={{ type: 'connector', id: 'laptop' }}
      aria-label={`${text}. Open connection details`}
      className="-me-2 ms-auto flex h-9 w-fit items-center gap-2 rounded-md px-2 text-small whitespace-nowrap text-ink-2 transition-colors duration-150 ease-out-quint hover-fine:bg-surface-2 focus-visible:outline-2 focus-visible:outline-pill grid-md:justify-end"
    >
      <span aria-hidden className={cn('size-2 shrink-0 rounded-full', fresh ? 'bg-good' : 'bg-ink-3')} />
      {text}
    </PeekLink>
  )
}
