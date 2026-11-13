'use client'

import { QrCode } from 'lucide-react'
import { Button } from '../button'

/** Fired by the header's "Connect a device"; the Devices panel owns the dialog and listens for it. */
export const CONNECT_EVENT = 'relife:connect-device'

export function ConnectButton() {
  return (
    <Button variant="primary" onClick={() => window.dispatchEvent(new Event(CONNECT_EVENT))}>
      <QrCode className="size-4" strokeWidth={2} aria-hidden />Connect a device
    </Button>
  )
}
