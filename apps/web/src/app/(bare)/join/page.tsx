import type { Metadata } from 'next'
import { BareShell } from '@/ui/components/devices/bare-shell'
import { JoinClient } from '@/ui/components/devices/join-client'

export const metadata: Metadata = { title: 'Join this server', robots: { index: false } }

// An invite link lands here. The secret is in the URL fragment, which the server never sees.
export default function JoinPage() {
  return (
    <BareShell>
      <JoinClient />
    </BareShell>
  )
}
