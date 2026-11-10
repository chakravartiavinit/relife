'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { Pause, Pencil, Play, Trash2 } from 'lucide-react'
import { deleteSchedule, setScheduleActive } from '@/app/actions'
import { useToast } from '../toast'
import { RowMenu } from '../row-menu'
import { ScheduleDialog, type ScheduleInitial } from './schedule-form'

/** Edit, pause or resume, and a two-step delete for one routine, behind a single "⋯". */
export function ScheduleActions({ initial, active, name }: { initial: ScheduleInitial; active: boolean; name: string }) {
  const [editing, setEditing] = useState(false)
  const [on, setOn] = useOptimistic(active)
  const [, start] = useTransition()
  const toast = useToast()
  return (
    <>
      <RowMenu label={name} items={[
        { label: 'Edit', icon: Pencil, onSelect: () => setEditing(true) },
        { label: on ? 'Pause' : 'Resume', icon: on ? Pause : Play, onSelect: () => start(async () => { setOn(!on); await setScheduleActive(initial.id!, !on); toast(on ? `${name} paused` : `${name} resumed`, on ? 'neutral' : 'good', { icon: on ? Pause : Play }) }) },
        { label: 'Delete', icon: Trash2, danger: true, onSelect: () => start(async () => { await deleteSchedule(initial.id!); toast(`${name} deleted`, 'neutral', { icon: Trash2 }) }) },
      ]} />
      <ScheduleDialog open={editing} initial={initial} onClose={() => setEditing(false)} />
    </>
  )
}
