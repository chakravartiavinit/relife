'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { saveAreas } from '@/app/actions'
import { CATEGORIES, type Category } from '@/domain/categories'
import { Switch } from '@/ui/beui/motion/switch'
import { CATEGORY } from '../tokens'
import { AREA_ICON, CapsuleIcon } from './capsule-icon'
import { SettingsSection } from './settings-layout'

/** Settings → Areas: one switch per area. Hiding one removes it from Life, quests and suggestions and keeps its data. */
export function AreasSettings({ initial }: { initial: Category[] }) {
  const [on, setOn] = useState(() => new Set(initial.length ? initial : CATEGORIES))
  const [state, setState] = useState<'idle' | 'saved' | 'error'>('idle')
  const [pending, start] = useTransition()
  const toggle = (c: Category, v: boolean) => {
    const next = new Set(on)
    if (v) next.add(c); else next.delete(c)
    if (!next.size) { setState('error'); return }
    setOn(next)
    start(async () => { const r = await saveAreas([...next]); setState(r.ok ? 'saved' : 'error') })
  }
  return (
    <SettingsSection
      id="areas" title="Areas" description="Areas you show get a page in Life, quests and suggestions. Hiding one keeps its data."
      action={<span aria-live="polite" className={`inline-flex h-8 items-center gap-1.5 text-caption ${state === 'error' ? 'text-bad' : 'text-ink-3'}`}>{pending ? <><Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} />Saving</> : state === 'saved' ? <><Check className="size-3.5" strokeWidth={1.5} />Saved</> : state === 'error' ? 'Keep at least one area' : null}</span>}
    >
      <ul className="grid gap-2 py-5 sm:grid-cols-2 xl:grid-cols-3">
        {CATEGORIES.map((c) => (
          <li key={c} className="flex min-h-12 items-center gap-3 rounded-md bg-surface-2 px-3 py-2">
            <CapsuleIcon color={CATEGORY[c].color} icon={AREA_ICON[c]} size="sm" />
            <span className="min-w-0 flex-1 truncate text-body font-medium text-ink">{CATEGORY[c].label}</span>
            <Switch checked={on.has(c)} onCheckedChange={(v) => toggle(c, v)} ariaLabel={`Show ${CATEGORY[c].label}`} />
          </li>
        ))}
      </ul>
    </SettingsSection>
  )
}
