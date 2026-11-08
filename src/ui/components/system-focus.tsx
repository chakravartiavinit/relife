'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { saveSystemFocus } from '@/app/actions'
import type { Category } from '@/db/schema'
import { CATEGORY } from '../tokens'
import { SettingsRow, SettingsSection } from './settings-layout'
import { cn } from '../cn'

export type FocusStat = { id: string; name: string; area: string; better: 'more' | 'less' }

/** Settings → The System: tap the numbers you want to improve; daily quests train those first. */
export function SystemFocus({ stats, initial }: { stats: FocusStat[]; initial: string[] }) {
  const [picked, setPicked] = useState(() => new Set(initial))
  const [state, setState] = useState<'idle' | 'saved'>('idle')
  const [pending, start] = useTransition()
  const toggle = (id: string) => {
    const next = new Set(picked)
    if (next.has(id)) next.delete(id); else next.add(id)
    setPicked(next)
    start(async () => { await saveSystemFocus([...next]); setState('saved') })
  }

  return (
    <SettingsSection
      id="system"
      title="The System"
      description="Each day the System reads your data and sets quests a little better than your usual. Pick what you want to improve and it trains those first; leave it empty and it chooses what’s slipping."
      action={<span aria-live="polite" className="inline-flex h-8 items-center gap-1.5 text-[12.5px] text-ink-3">{pending ? <><Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} />Saving</> : state === 'saved' ? <><Check className="size-3.5" strokeWidth={1.5} />Saved</> : null}</span>}
    >
      <SettingsRow label="Improve" hint="Numbers from your connectors and logs. New ones appear as data comes in.">
        {stats.length ? (
          <div role="group" aria-label="Stats to improve" className="flex flex-wrap gap-2">
            {stats.map((s) => {
              const on = picked.has(s.id)
              const color = CATEGORY[s.area as Category]?.color ?? 'var(--pill)'
              return (
                <button
                  key={s.id} type="button" aria-pressed={on} onClick={() => toggle(s.id)}
                  className={cn(
                    'inline-flex h-10 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium transition-[background-color,color,box-shadow,scale] duration-150 ease-out-quint active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill',
                    on ? 'bg-surface text-ink shadow-[0_0_0_2px_var(--pill)]' : 'bg-surface-2 text-ink-2 hover:text-ink',
                  )}
                >
                  <span aria-hidden className="size-2 rounded-full" style={{ background: color }} />
                  {s.better === 'less' ? 'Less ' : 'More '}{s.name.toLowerCase()}
                  {on ? <Check className="size-3.5 text-pill-ink" strokeWidth={2} aria-hidden /> : null}
                </button>
              )
            })}
          </div>
        ) : (
          <p className="text-[13px] text-ink-3">No numbers yet. Connect an app or log mood, sleep or steps for a few days.</p>
        )}
      </SettingsRow>
    </SettingsSection>
  )
}
