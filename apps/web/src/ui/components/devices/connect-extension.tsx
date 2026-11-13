'use client'

import { useEffect, useState } from 'react'
import { ConnectDialog } from './connect-dialog'

/** Fired by "Connect the Chrome extension" on Connectors → Laptop activity; <ConnectExtension /> owns the dialog. */
const CONNECT_EXTENSION_EVENT = 'relife:connect-extension'
export const openConnectExtension = () => window.dispatchEvent(new Event(CONNECT_EXTENSION_EVENT))

/** The Connect dialog in approve-a-code mode: the extension shows a code, the owner types it here. */
export function ConnectExtension() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const on = () => setOpen(true)
    window.addEventListener(CONNECT_EXTENSION_EVENT, on)
    return () => window.removeEventListener(CONNECT_EXTENSION_EVENT, on)
  }, [])
  return <ConnectDialog open={open} onClose={() => setOpen(false)} mode="approve" />
}
