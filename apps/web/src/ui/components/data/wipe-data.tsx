'use client'

import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { wipeAllData } from '@/app/actions'
import { WIPE_CONFIRM } from '@/core/data/wipe-confirm'
import { cn } from '@/ui/cn'
import { Button, buttonClass } from '../button'
import { Dialog } from '../forms/dialog'
import { useToast } from '../toast'

// Delete everything: a button that opens a dialog saying what goes and what stays, then needs a second press. The first
// press arms the button for 4 seconds ("Tap again", the row-menu pattern), so one stray tap or Enter never deletes.

const ARM_MS = 4000

const GOES = ['Routines, entries, payments, trades and goals', 'XP, quests and achievements', 'Connections and every saved key', 'Browser sign-ins for shopping apps', 'Library pictures, the Coach conversation and notes']
const STAYS = ['Devices that are already signed in', 'Your region and the theme', 'The key file (data/secret.key), which protects nothing once the keys are gone', 'Backups and exports you already made']

/** After a wipe the page does a full load: drop what the browser kept for the old data (the sidebar choice stays). */
function clearBrowserState() {
  for (const k of Object.keys(localStorage)) if (k.startsWith('relife:') && k !== 'relife:sidebar') localStorage.removeItem(k)
  sessionStorage.clear()
}

export function WipeData({ action = wipeAllData, onDone = () => { clearBrowserState(); window.location.assign('/welcome') }, backupDir }: {
  action?: (confirm: string) => Promise<{ ok: true } | { ok: false; error: string }>
  /** What happens on success. The page sends you to /welcome; /dev/ui does nothing. */
  onDone?: () => void
  backupDir?: string
}) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [armed, setArmed] = useState(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), ARM_MS)
    return () => clearTimeout(t)
  }, [armed])

  const close = () => { if (!pending) { setOpen(false); setArmed(false) } }

  async function press() {
    if (!armed) return setArmed(true)
    setPending(true)
    try {
      const r = await action(WIPE_CONFIRM)
      if (r.ok) return onDone()
      toast.error(r.error)
    } catch {
      toast.error('Could not delete your data.', 'Nothing was changed. Try again.')
    }
    setPending(false)
    setArmed(false)
  }

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}><Trash2 className="size-4" strokeWidth={1.5} aria-hidden />Delete all data…</Button>
      <Dialog open={open} onClose={close} icon={Trash2} color="var(--bad)" title="Delete everything on this machine?" description="This cannot be undone. Setup starts again afterwards.">
        <div className="grid gap-5 sm:grid-cols-2">
          <List title="Goes" items={GOES} />
          <List title="Stays" items={backupDir ? [...STAYS.slice(0, 3), `Backups and exports you already made (${backupDir})`] : STAYS} />
        </div>
        <p className="mt-5 text-small text-ink-2">
          Want a copy first? <a href="/api/export" download className="font-medium text-ink underline underline-offset-2 hover:no-underline">Download an export</a>.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={close} disabled={pending}>Cancel</Button>
          <button
            type="button" onClick={press} disabled={pending} aria-live="polite"
            className={cn(buttonClass({ variant: 'danger' }), armed && 'bg-bad text-surface hover:bg-bad hover:brightness-110')}
          >
            <Trash2 className="size-4" strokeWidth={1.5} aria-hidden />{pending ? 'Deleting…' : armed ? 'Tap again to delete everything' : 'Delete all data'}
          </button>
        </div>
      </Dialog>
    </>
  )
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="min-w-0">
      <p className="mb-2 font-mono text-label text-ink-3 uppercase">{title}</p>
      <ul className="flex flex-col gap-1.5 text-small text-ink-2">
        {items.map((i) => <li key={i} className="flex gap-2"><span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-3" />{i}</li>)}
      </ul>
    </div>
  )
}
