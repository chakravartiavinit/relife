'use client'

import { StatusRow } from '../status-row'
import { openCapture } from '../capture/capture-data'
import type { PictureRef } from '@/ui/picture'
import type { Status } from '@/domain/status-of'

/** A Life pulse row with nothing logged yet: it looks like any status row, and a tap opens Capture to log it. */
export function CaptureRow({ picture, name, line, status }: { picture: PictureRef; name: string; line: string; status: Status }) {
  return (
    <button type="button" onClick={() => openCapture()} aria-label={`${name}: ${line}. Log it`} className="block w-full text-start">
      <StatusRow picture={picture} name={name} line={line} status={status} trailing={<span aria-hidden />} className="hover-fine:bg-surface-2" />
    </button>
  )
}
