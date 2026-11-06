'use client'

import { useEffect, useState, useTransition } from 'react'
import { Pause, Play, Trash2 } from 'lucide-react'
import { deleteSchedule, setScheduleActive } from '@/app/actions'
import { Button } from '../button'
import { useToast } from '../toast'

/** Pause/resume and a two-step delete (second click within 3s confirms). */
export function SubscriptionActions({ id, name, active }: { id: string; name: string; active: boolean }) {
  const [pending, start] = useTransition()
  const [confirm, setConfirm] = useState(false)
  const toast = useToast()

  useEffect(() => {
    if (!confirm) return
    const t = setTimeout(() => setConfirm(false), 3000)
    return () => clearTimeout(t)
  }, [confirm])

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={pending}
        aria-label={active ? `Pause ${name}` : `Resume ${name}`}
        onClick={() => start(async () => { await setScheduleActive(id, !active); toast(active ? `${name} paused` : `${name} resumed`) })}
      >
        {active ? <Pause className="size-4" strokeWidth={1.5} /> : <Play className="size-4" strokeWidth={1.5} />}
      </Button>
      {confirm ? (
        <Button
          variant="danger"
          size="sm"
          disabled={pending}
          onClick={() => start(async () => { await deleteSchedule(id); toast(`${name} deleted`) })}
        >
          Delete?
        </Button>
      ) : (
        <Button variant="ghost" size="icon-sm" disabled={pending} aria-label={`Delete ${name}`} onClick={() => setConfirm(true)}>
          <Trash2 className="size-4" strokeWidth={1.5} />
        </Button>
      )}
    </div>
  )
}
