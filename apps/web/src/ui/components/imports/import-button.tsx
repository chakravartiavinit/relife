'use client'

import { useEffect, useState } from 'react'
import { FileUp } from 'lucide-react'
import { Button } from '../button'
import { ImportDialog } from './import-dialog'

/** "Import a file" on Connections. `?import=1` (the first-day checklist link) opens it on arrival. */
export function ImportButton({ zipMaxMb }: { zipMaxMb?: number }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    if (q.get('import') !== '1') return
    setOpen(true)
    q.delete('import')
    const rest = q.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`)
  }, [])
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}><FileUp aria-hidden className="size-4" strokeWidth={1.5} />Import a file</Button>
      <ImportDialog open={open} onClose={() => setOpen(false)} zipMaxMb={zipMaxMb} />
    </>
  )
}
