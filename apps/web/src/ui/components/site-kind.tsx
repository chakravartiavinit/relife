'use client'

import { useState, useTransition } from 'react'
import { setSiteKindAction } from '@/app/actions'
import { ACTIVITY_KINDS, KIND_INFO, type ActivityKind } from '@/domain/activity'
import { KIND_COLOR } from '../activity-colors'
import { useToast } from './toast'
import { Select } from './select'

/** "Counts as" for one site: pick what its time is (Crunchyroll → entertainment). Re-sorts its past time too. */
export function SiteKind({ domain, kind }: { domain: string; kind: ActivityKind }) {
  const [value, setValue] = useState(kind)
  const [pending, start] = useTransition()
  const toast = useToast()
  return (
    <Select
      variant="pill" aria-label={`${domain} counts as`} value={value} disabled={pending} className="w-[10.5rem] shrink-0"
      onChange={(e) => {
        const k = e.target.value as ActivityKind
        setValue(k)
        start(async () => {
          const r = await setSiteKindAction(domain, k)
          toast(`${domain} counts as ${KIND_INFO[k].label.toLowerCase()}`, 'good', { description: r.changed ? `${r.changed} past ${r.changed === 1 ? 'day' : 'days'} re-sorted` : undefined })
        })
      }}
    >
      {ACTIVITY_KINDS.map((k) => <option key={k} value={k} data-color={KIND_COLOR[k]}>{KIND_INFO[k].label}</option>)}
    </Select>
  )
}

/** The same tag, read-only: Mac apps are sorted automatically. */
export function KindTag({ kind }: { kind: ActivityKind }) {
  return (
    <span className="inline-flex h-8 w-[10.5rem] shrink-0 items-center gap-2 rounded-full bg-surface-2 ps-3 pe-3 text-[12px] font-medium text-ink-2" title="Mac apps are sorted automatically">
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: KIND_COLOR[kind] }} />
      <span className="truncate">{KIND_INFO[kind].label}</span>
    </span>
  )
}
