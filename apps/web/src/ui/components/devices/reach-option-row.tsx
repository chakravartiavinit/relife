'use client'

import { useState } from 'react'
import { ChevronDown, Globe, Network, Wifi, Link2, type LucideIcon } from 'lucide-react'
import type { ReachId, ReachOption } from '@/core/auth/reach'
import { cn } from '@/ui/cn'
import { Badge } from '../card'
import { CopyLine } from './copy-line'

const ABOUT: Record<ReachId, { icon: LucideIcon; title: string }> = {
  origin: { icon: Link2, title: 'The address you opened this on' },
  tailscale: { icon: Network, title: 'Tailscale' },
  lan: { icon: Wifi, title: 'Same Wi-Fi' },
  public: { icon: Globe, title: 'Your own address' },
}

const STATE: Record<ReachOption['state'], { label: string; color?: string }> = {
  ready: { label: 'Ready', color: 'var(--good)' },
  'needs-setup': { label: 'Needs setup', color: 'var(--warn)' },
  unavailable: { label: 'Not available' },
}

/** What a phone gets on this address, in plain words. */
const works = (o: ReachOption) => (o.https ? 'Web app, install to Home Screen and notifications.' : 'Web app only. Install and notifications need https.')

/**
 * One way a phone can reach the server, as a radio card. Only a ready one can be picked; the others open a fix with the lines
 * to copy. The radio and the fix are separate buttons, so neither sits inside the other.
 */
export function ReachOptionRow({ option, selected, onPick }: { option: ReachOption; selected: boolean; onPick: () => void }) {
  const [open, setOpen] = useState(false)
  const { icon: Icon, title } = ABOUT[option.id]
  const state = STATE[option.state]
  const pickable = option.state === 'ready'
  const host = option.url ? option.url.replace(/^https?:\/\//, '') : null
  const fixId = `fix-${option.id}`
  return (
    <li className={cn('rounded-[16px] p-4 transition-[background-color,box-shadow] duration-150 ease-out-quint', selected ? 'bg-pill-wash shadow-[inset_0_0_0_2px_var(--pill)]' : 'bg-surface shadow-1')}>
      <div className="flex items-start gap-3">
        <button
          type="button" role="radio" aria-checked={selected} disabled={!pickable} onClick={onPick}
          className="group flex min-w-0 flex-1 items-start gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill disabled:cursor-default"
        >
          <span aria-hidden className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full shadow-inset', selected ? 'bg-pill' : 'bg-surface-2')}>
            {selected ? <span className="size-2 rounded-full bg-surface" /> : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className={cn('flex items-center gap-2 text-body font-semibold', pickable ? 'text-ink' : 'text-ink-2')}>
              <Icon className="size-4 shrink-0 text-ink-3" strokeWidth={1.5} aria-hidden />{title}
            </span>
            {host ? <span title={option.url ?? undefined} className="mt-0.5 block truncate font-mono text-caption text-ink-2">{host}</span> : null}
            <span className="mt-0.5 block text-caption text-ink-3">{works(option)}</span>
            {option.addresses && option.addresses.length > 1 ? <span className="mt-0.5 block truncate text-caption text-ink-3" title={option.addresses.join(', ')}>Also on this network: {option.addresses.slice(1).join(', ')}</span> : null}
          </span>
        </button>
        <Badge color={state.color} className="mt-0.5">{state.label}</Badge>
      </div>
      {option.fixes.length ? (
        <div className="mt-2 pl-8">
          <button
            type="button" aria-expanded={open} aria-controls={fixId} onClick={() => setOpen(!open)}
            className="inline-flex h-10 items-center gap-1 rounded-md text-small font-medium text-pill-ink hover:underline focus-visible:outline-2 focus-visible:outline-pill"
          >
            {option.state === 'ready' ? 'Details' : 'How to set this up'}
            <ChevronDown className={cn('size-4 transition-transform duration-150 ease-out-quint', open && 'rotate-180')} strokeWidth={1.5} aria-hidden />
          </button>
          {open ? (
            <div id={fixId} className="mt-1 flex flex-col gap-3">
              {option.fixes.map((f) => (
                <div key={f.label} className="flex flex-col gap-2">
                  <p className="text-small text-ink-2">{f.label}</p>
                  {f.envLines ? <CopyLine lines={f.envLines} label="lines for .env" /> : null}
                  {f.command ? <CopyLine lines={[f.command]} label="command" /> : null}
                  {f.href ? <a href={f.href} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center text-small font-medium text-pill-ink hover:underline focus-visible:outline-2 focus-visible:outline-pill">Open {new URL(f.href).host}</a> : null}
                  {f.notes?.length ? <ul className="flex list-disc flex-col gap-1 pl-5 text-caption text-ink-3">{f.notes.map((n) => <li key={n}>{n}</li>)}</ul> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}
