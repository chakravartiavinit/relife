'use client'

import { useEffect, useState } from 'react'
import { LayoutTemplate } from 'lucide-react'
import { Button } from '../button'
import { useToast } from '../toast'
import { TemplatesDialog } from './templates-dialog'

/**
 * "Browse templates" (Plan › Routines, You › Settings). `?templates=1` opens it on arrival, and `&pack=<https link>`
 * fills the link box (nothing is fetched until the person taps Open link). `locked` (the read-only demo: the reason) keeps
 * the dialog shut: adding a pack is a write, so the button says so with the demo toast instead.
 */
export function TemplatesButton({ locked, size = 'md' }: { locked?: string; size?: 'sm' | 'md' }) {
  const [open, setOpen] = useState(false)
  const [link, setLink] = useState('')
  const toast = useToast()
  useEffect(() => {
    if (locked) return
    const q = new URLSearchParams(window.location.search)
    if (q.get('templates') !== '1') return
    setLink(q.get('pack') ?? '')
    setOpen(true)
    q.delete('templates'); q.delete('pack')
    const rest = q.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`)
  }, [locked])
  return (
    <>
      <Button variant="secondary" size={size} aria-disabled={locked ? true : undefined} title={locked} className={locked ? 'opacity-60' : undefined} onClick={() => (locked ? toast.error(locked) : setOpen(true))}>
        <LayoutTemplate aria-hidden className="size-4" strokeWidth={1.5} />Browse templates
      </Button>
      <TemplatesDialog open={open && !locked} onClose={() => setOpen(false)} initialLink={link} />
    </>
  )
}
