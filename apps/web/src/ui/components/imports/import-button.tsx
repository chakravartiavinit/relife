'use client'

import { useEffect, useState } from 'react'
import { FileUp } from 'lucide-react'
import { Button } from '../button'
import { useToast } from '../toast'
import { ImportDialog } from './import-dialog'

/**
 * "Import a file" on Connections. `?import=1` (the first-day checklist link) opens it on arrival. `locked` (the read-only
 * demo: the reason, "Demo: changes are off") keeps the dialog shut: the button says so with the demo toast instead.
 */
export function ImportButton({ zipMaxMb, locked }: { zipMaxMb?: number; locked?: string }) {
  const [open, setOpen] = useState(false)
  const toast = useToast()
  useEffect(() => {
    if (locked) return
    const q = new URLSearchParams(window.location.search)
    if (q.get('import') !== '1') return
    setOpen(true)
    q.delete('import')
    const rest = q.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`)
  }, [locked])
  return (
    <>
      <Button variant="secondary" aria-disabled={locked ? true : undefined} title={locked} className={locked ? 'opacity-60' : undefined} onClick={() => (locked ? toast.error(locked) : setOpen(true))}><FileUp aria-hidden className="size-4" strokeWidth={1.5} />Import a file</Button>
      <ImportDialog open={open && !locked} onClose={() => setOpen(false)} zipMaxMb={zipMaxMb} />
    </>
  )
}
