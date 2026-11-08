'use client'

import { useState, useTransition } from 'react'
import { setSiteKindAction } from '@/app/actions'
import { ACTIVITY_KINDS, KIND_INFO, type ActivityKind } from '@/domain/activity'
import { KIND_COLOR } from '../activity-colors'
import { useToast } from './toast'

/** "Counts as" for one site: pick what its time is (Crunchyroll → entertainment). Re-sorts its past time too. */
export function SiteKind({ domain, kind }: { domain: string; kind: ActivityKind }) {
  const [value, setValue] = useState(kind)
  const [pending, start] = useTransition()
  const toast = useToast()
  return (
    <label className="relative inline-flex">
      <span className="sr-only">{domain} counts as</span>
      <span aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-2 -translate-y-1/2 rounded-full" style={{ background: KIND_COLOR[value] }} />
      <select
        value={value} disabled={pending}
        onChange={(e) => {
          const k = e.target.value as ActivityKind
          setValue(k)
          start(async () => {
            const r = await setSiteKindAction(domain, k)
            toast(`${domain} counts as ${KIND_INFO[k].label.toLowerCase()}${r.changed ? `; re-sorted ${r.changed} ${r.changed === 1 ? 'day' : 'days'}` : ''}`, 'good')
          })
        }}
        className="h-8 cursor-pointer appearance-none rounded-full bg-surface-2 ps-6 pe-3 text-[12px] font-medium text-ink-2 transition-[background-color,color] duration-150 hover:bg-surface-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill disabled:opacity-60"
      >
        {ACTIVITY_KINDS.map((k) => <option key={k} value={k}>{KIND_INFO[k].label}</option>)}
      </select>
    </label>
  )
}
