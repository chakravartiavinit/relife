'use client'

import { Plus } from 'lucide-react'
import { Button } from '../button'
import { openCapture } from '../capture/capture-data'

/** "Log health": opens Capture. Logging is one surface; areas only name it. */
export function LogButton({ label }: { label: string }) {
  return (
    <Button variant="secondary" onClick={() => openCapture()}>
      <Plus className="size-4" strokeWidth={2} aria-hidden />
      {label}
    </Button>
  )
}
