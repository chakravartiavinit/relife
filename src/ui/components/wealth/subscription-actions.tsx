'use client'

import { useState, useTransition } from 'react'
import { Pause, Pencil, Play, Trash2 } from 'lucide-react'
import { deleteSchedule, setScheduleActive } from '@/app/actions'
import { useToast } from '../toast'
import { RowMenu } from '../row-menu'
import { SubscriptionDialog, type SubscriptionValues } from './subscription-form'

/** Edit, pause or resume, and a two-step delete, behind a single "⋯". */
export function SubscriptionActions({ values, active, today, baseCurrency }: { values: SubscriptionValues & { id: string }; active: boolean; today: string; baseCurrency: string }) {
  const [, start] = useTransition()
  const [editing, setEditing] = useState(false)
  const toast = useToast()
  const { id, name } = values
  return (
    <>
      <RowMenu label={name} items={[
        { label: 'Edit', icon: Pencil, onSelect: () => setEditing(true) },
        { label: active ? 'Pause' : 'Resume', icon: active ? Pause : Play, onSelect: () => start(async () => { await setScheduleActive(id, !active); toast(active ? `${name} paused` : `${name} resumed`, active ? 'neutral' : 'good', { icon: active ? Pause : Play }) }) },
        { label: 'Delete', icon: Trash2, danger: true, onSelect: () => start(async () => { await deleteSchedule(id); toast(`${name} deleted`, 'neutral', { icon: Trash2 }) }) },
      ]} />
      <SubscriptionDialog open={editing} onClose={() => setEditing(false)} today={today} baseCurrency={baseCurrency} initial={values} />
    </>
  )
}
