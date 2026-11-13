'use client'

import { Plus } from 'lucide-react'
import { Button } from '../button'
import { openCapture } from '../capture/capture-data'

/** "Log something": opens Capture (the same sheet as the + button), for empty states that should not dead-end. */
export function CaptureButton({ children = 'Log something' }: { children?: React.ReactNode }) {
  return <Button variant="secondary" size="lg" onClick={() => openCapture()}><Plus className="size-4" strokeWidth={2} aria-hidden />{children}</Button>
}
