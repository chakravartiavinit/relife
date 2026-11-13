'use client'

import { useRef, useState, useTransition } from 'react'
import { BellRing, Check, Lightbulb, Loader2, Moon, Search, Sparkles, Swords, TriangleAlert, type LucideIcon } from 'lucide-react'
import { saveNotifications } from '@/app/actions'
import { CATEGORY_INFO, DEFAULT_QUIET, NOTIFY_CATEGORIES, delivery, type Delivery, type NotifyCategory, type NotifyPrefs } from '@/domain/notify'
import { Switch } from '@/ui/beui/motion/switch'
import { Input, Select } from './form'
import { SettingsRow, SettingsSection } from './settings-layout'
import { cn } from '../cn'

const ICON: Record<NotifyCategory, LucideIcon> = { system: Swords, reminders: BellRing, alerts: TriangleAlert, analysis: Search, coach: Lightbulb, events: Sparkles }
const EVERY = [10, 15, 30, 60, 120, 240]
const TIMES = [1, 2, 3, 5]
const CAPS = [1, 2, 3, 5, 6, 10]
const every = (m: number) => (m < 60 ? `${m} min` : `${m / 60} ${m === 60 ? 'hour' : 'hours'}`)

/** You › Notifications: quiet hours, then one row per category with how it's delivered. Saves as you change it. */
export function NotificationSettings({ initial }: { initial?: NotifyPrefs }) {
  const [quiet, setQuiet] = useState(initial && 'quiet' in initial ? initial.quiet : DEFAULT_QUIET)
  const [cats, setCats] = useState(() => Object.fromEntries(NOTIFY_CATEGORIES.map((c) => [c, delivery(initial, c)])) as Record<NotifyCategory, Delivery>)
  const [state, setState] = useState<'idle' | 'saved' | 'error'>('idle')
  const [pending, start] = useTransition()
  const lastQuiet = useRef(quiet ?? DEFAULT_QUIET)

  const save = (next: { quiet: NotifyPrefs['quiet']; categories: Record<NotifyCategory, Delivery> }) => start(async () => {
    const r = await saveNotifications(next)
    setState(r.ok ? 'saved' : 'error')
  })
  const setQ = (q: NotifyPrefs['quiet']) => { if (q) lastQuiet.current = q; setQuiet(q); save({ quiet: q, categories: cats }) }
  const setCat = (c: NotifyCategory, patch: Partial<Delivery>) => {
    const next = { ...cats, [c]: { ...cats[c], ...patch } }
    setCats(next)
    save({ quiet, categories: next })
  }

  return (
    <SettingsSection
      id="notifications"
      title="Notifications"
      description="What ReLife sends to Telegram, and how often. Everything also shows in the app, even when a message isn't sent."
      action={
        <span aria-live="polite" className={cn('inline-flex h-8 items-center gap-1.5 text-[12.5px]', state === 'error' ? 'text-bad' : 'text-ink-3')}>
          {pending ? <><Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} /> Saving</> : state === 'saved' ? <><Check className="size-3.5" strokeWidth={1.5} /> Saved</> : state === 'error' ? 'Couldn’t save' : null}
        </span>
      }
    >
      <SettingsRow label={<span className="inline-flex items-center gap-2"><Moon className="size-4 text-ink-3" strokeWidth={1.5} />Quiet hours</span>} hint="Messages that can wait are held until quiet hours end.">
        <div className="flex flex-wrap items-center gap-3">
          <Switch checked={!!quiet} onCheckedChange={(on) => setQ(on ? lastQuiet.current : null)} ariaLabel="Quiet hours" />
          {quiet ? (
            <div className="flex items-center gap-2 text-[13px] text-ink-3">
              <Input type="time" aria-label="Quiet from" value={quiet.from} onChange={(e) => e.target.value && setQ({ ...quiet, from: e.target.value })} className="w-36 tabular-nums" />
              to
              <Input type="time" aria-label="Quiet until" value={quiet.to} onChange={(e) => e.target.value && setQ({ ...quiet, to: e.target.value })} className="w-36 tabular-nums" />
            </div>
          ) : <span className="text-[13px] text-ink-3">Off: messages arrive any time</span>}
        </div>
      </SettingsRow>

      {NOTIFY_CATEGORIES.map((c) => {
        const info = CATEGORY_INFO[c]
        const d = cats[c]
        const Icon = ICON[c]
        const modes: { value: Delivery['mode']; label: string }[] = [
          { value: 'off', label: 'Off' }, { value: 'once', label: 'Once' },
          ...(info.repeatable ? [{ value: 'repeat' as const, label: 'Until I respond' }] : []),
        ]
        return (
          <SettingsRow key={c} label={<span className="inline-flex items-center gap-2"><Icon className="size-4 text-ink-3" strokeWidth={1.5} />{info.label}</span>} hint={info.about}>
            <div className="flex flex-col gap-3">
              <div role="radiogroup" aria-label={`${info.label} delivery`} className="inline-flex w-fit rounded-md bg-surface-2 p-1">
                {modes.map((m) => {
                  const on = d.mode === m.value
                  return (
                    <button
                      key={m.value} type="button" role="radio" aria-checked={on} onClick={() => setCat(c, { mode: m.value })}
                      className={cn(
                        'flex h-8 items-center rounded-sm px-3 text-[13px] font-medium transition-[background-color,color,box-shadow,scale] duration-150 ease-out-quint active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill',
                        on ? 'bg-surface text-ink shadow-1' : 'text-ink-3 hover:text-ink',
                      )}
                    >
                      {m.label}
                    </button>
                  )
                })}
              </div>

              {d.mode === 'repeat' ? (
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
                  Again every
                  <Select aria-label={`${info.label}: repeat every`} value={d.everyMin} onChange={(e) => setCat(c, { everyMin: Number(e.target.value) })} className="w-auto">
                    {EVERY.map((m) => <option key={m} value={m}>{every(m)}</option>)}
                  </Select>
                  up to
                  <Select aria-label={`${info.label}: extra times`} value={d.times} onChange={(e) => setCat(c, { times: Number(e.target.value) })} className="w-auto">
                    {TIMES.map((n) => <option key={n} value={n}>{n} more {n === 1 ? 'time' : 'times'}</option>)}
                  </Select>
                </div>
              ) : null}

              {d.mode !== 'off' ? (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-ink-2">
                  <Switch checked={d.quiet} onCheckedChange={(v) => setCat(c, { quiet: v })} label="Hold during quiet hours" disabled={!quiet} />
                  <label className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap">
                    At most
                    <Select value={d.maxPerDay ?? ''} onChange={(e) => setCat(c, { maxPerDay: e.target.value ? Number(e.target.value) : null })} className="w-auto">
                      <option value="">no limit</option>
                      {CAPS.map((n) => <option key={n} value={n}>{n} a day</option>)}
                    </Select>
                  </label>
                </div>
              ) : <p className="text-[12.5px] text-ink-3">Not sent. You’ll still see these in the app.</p>}
            </div>
          </SettingsRow>
        )
      })}
    </SettingsSection>
  )
}
