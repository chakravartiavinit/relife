'use client'

import { Button } from './button'
import { DemoBadge, DemoStrip } from './demo-banner'
import { ToastProvider, useToast } from './toast'

/** The read-only demo (RELIFE_DEMO=1): the banner strip, the sidebar badge and the one toast every blocked write shows. */
function Inner() {
  const toast = useToast()
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-lg shadow-1"><DemoStrip /></div>
      <div className="w-60"><DemoBadge /></div>
      <div className="flex flex-wrap gap-2">
        {/* Three taps inside 2 s still make one toast. */}
        <Button onClick={() => { toast.error(); toast.error(); toast.error() }}>A blocked write</Button>
      </div>
    </div>
  )
}

export function DemoGallery() {
  return <ToastProvider demo><Inner /></ToastProvider>
}
