'use client'

import { Plus } from 'lucide-react'
import { Button } from '../button'
import { openCapture } from '../capture/capture-data'

/** "Log health": opens Capture. Logging is one surface; areas only name it. An icon button on a phone (the head's container), the label from 640px. */
export function LogButton({ label }: { label: string }) {
  return (
    <Button variant="secondary" className="w-9 px-0 grid-md:w-auto grid-md:px-3.5" onClick={() => openCapture()}>
      <Plus className="size-4" strokeWidth={2} aria-hidden />
      <span className="sr-only grid-md:not-sr-only">{label}</span>
    </Button>
  )
}
