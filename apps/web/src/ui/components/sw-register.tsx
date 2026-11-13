'use client'

import { useEffect } from 'react'

/** Registers the service worker that shows web push (public/sw.js). Only where the browser allows it: a secure context. */
export function SwRegister() {
  useEffect(() => {
    if (window.isSecureContext && 'serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})
  }, [])
  return null
}
