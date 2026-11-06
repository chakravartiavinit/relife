'use client'

import { Switch } from '@/ui/beui/motion/switch'
import { useEffect, useOptimistic, useState, useTransition } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { deleteSchedule, setScheduleActive } from '@/app/actions'
import { Button } from '../button'
import { useToast } from '../toast'
import { ScheduleDialog, type ScheduleInitial } from './schedule-form'

/** Active switch, edit and two-step delete for one schedule row. */
export function ScheduleActions({ initial, active, name }: { initial: ScheduleInitial; active: boolean; name: string }) {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [on, setOn] = useOptimistic(active)
  const [, start] = useTransition()
  const toast = useToast()

  useEffect(() => {
    if (!confirming) return
    const t = setTimeout(() => setConfirming(false), 3000)
    return () => clearTimeout(t)
  }, [confirming])

  return (
    <div className="flex items-center gap-1">
      <Switch
        className="mr-1.5"
        checked={on}
        ariaLabel={`${name} active`}
        onCheckedChange={(next) => start(async () => { setOn(next); await setScheduleActive(initial.id!, next) })}
      />
      <Button variant="ghost" size="icon" aria-label={`Edit ${name}`} onClick={() => setEditing(true)}>
        <Pencil className="size-4" strokeWidth={1.5} />
      </Button>
      {confirming ? (
        <Button
          variant="danger"
          size="sm"
          onClick={() => start(async () => { await deleteSchedule(initial.id!); toast(`Deleted ${name}`) })}
        >
          Delete?
        </Button>
      ) : (
        <Button variant="ghost" size="icon" aria-label={`Delete ${name}`} onClick={() => setConfirming(true)}>
          <Trash2 className="size-4" strokeWidth={1.5} />
        </Button>
      )}
      <ScheduleDialog open={editing} initial={initial} onClose={() => setEditing(false)} />
    </div>
  )
}
