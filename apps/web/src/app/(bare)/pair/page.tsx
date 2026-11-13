import type { Metadata } from 'next'
import { BareShell } from '@/ui/components/devices/bare-shell'
import { PairClient } from '@/ui/components/devices/pair-client'

export const metadata: Metadata = { title: 'Connect this device', robots: { index: false } }

// A scanned QR code lands here. The secret is in the URL fragment, which the server never sees.
export default function PairPage() {
  return (
    <BareShell>
      <PairClient />
    </BareShell>
  )
}
