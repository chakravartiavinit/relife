'use client'

import brand from '@relife/brand/brand.json'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useState } from 'react'
import { BedDouble, Check, CircleAlert, Clock, Droplet, Footprints, LoaderCircle, Lock, RefreshCw, SlidersHorizontal, Sparkles, Sun, Wallet, type LucideIcon } from 'lucide-react'
import type { Pack } from '@relife/contract'
import type { Category } from '@/db/schema'
import type { Template } from '@/core/onboarding'
import { buildRRule, describe } from '@/domain/recurrence'
import { connectHow, halfHours, startersOn } from '@/domain/onboarding'
import { suggestOnboardingRoutines } from '@/app/actions'
import { CATEGORY } from '../tokens'
import { Button } from './button'
import { Select } from './form'
import { CurrencyPicker, TimezonePicker } from './region-picker'
import { AREA_ICON, CapsuleIcon } from './capsule-icon'
import { Cmd } from './local-ai-check'
import type { LocalAiResult } from '@/app/actions'
import { AppLogo } from './app-logo'
import { ConnectorDialog, type ConnectorItem } from './connector-market'
import { InlineUsernameConnect } from './connections-status'
import { tzOffset, tzOption } from '../regions'
import { Input as BeuiInput } from '@/ui/beui/motion/input'
import { Switch } from '@/ui/beui/motion/switch'
import { AdaptiveStepper, AdaptiveStepperDecrement, AdaptiveStepperIncrement, AdaptiveStepperValue } from '@/ui/beui/motion/adaptive-stepper'
import {
  AREA_BLURB, AT, CUSTOM_BLURB, IMPROVE, MAX_IMPROVE, PACK_BLURB, canonTz, clamp, currencySign, fitSleep, nfIN, nightHours, type V,
} from './onboarding-data'
import { Group, IDLE, LINK, PICKED, PICKER, PILL_HIT, SWAP, Tick, Title, choice, item } from './onboarding-ui'
import { RoutineArt } from './routine-art'
import { cn } from '../cn'

// The six questions of setup. Every step comes filled in, so Enter walks straight through; each answer shows up in
// the save-file preview (onboarding-preview.tsx).

export type Ai = { ready: boolean; model: string | null }
export type Set = <K extends keyof V>(k: K, val: V[K]) => void
const AREAS = Object.keys(CATEGORY) as Category[]

// ── 1 · You ─────────────────────────────────────────────────────────────────────────────────────────
/** One line of the region card: an icon, the value, what it is, and Change (which opens the picker under it). */
function RegionRow({ icon: Icon, title, sub, open, onToggle, children }: {
  icon: LucideIcon; title: string; sub: string; open: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div className="border-divider py-2.5 not-first:border-t">
      <div className="flex min-h-10 items-center gap-3">
        <Icon aria-hidden className="size-4 shrink-0 text-ink-2" strokeWidth={1.5} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-small font-medium text-ink">{title}</span>
          <span className="block truncate text-caption text-ink-3">{sub}</span>
        </span>
        <button type="button" aria-expanded={open} onClick={onToggle} className={cn(LINK, 'shrink-0 no-underline')}>{open ? 'Done' : 'Change'}</button>
      </div>
      {open ? <div className="mt-2">{children}</div> : null}
    </div>
  )
}

export function StepYou({ v, set, suggested, timezones, currencies, nameError }: {
  v: V; set: Set; suggested: { tz: string; cur: string | null } | null; timezones: string[]; currencies: string[]; nameError: boolean
}) {
  const id = useId()
  const [open, setOpen] = useState<'tz' | 'cur' | null>(null)
  const same = !!suggested && canonTz(suggested.tz) === canonTz(v.timezone)
  const deviceTz = suggested && !same ? suggested.tz : null
  const cur = v.baseCurrency.toUpperCase()
  return (
    <>
      <Title step={AT.you} title="Start your save file" body={`${brand.name} turns your days into a character you level up. Setup takes about two minutes.`} />
      <motion.div variants={item}>
        <BeuiInput
          id={`${id}-n`} label="What should we call you?" value={v.name} onChange={(n) => set('name', n)} placeholder="First name" autoComplete="given-name" maxLength={60} autoFocus
          error={nameError} success={!!v.name.trim()}
          classNames={{ label: 'px-0 text-small font-semibold text-ink', field: 'h-12 rounded-md border-transparent bg-surface shadow-1', input: 'text-base sm:text-body' }}
        />
      </motion.div>
      {/* Above what follows (each block is its own layer once it has animated in), so an open list covers it. */}
      <motion.div variants={item} className="relative z-20 mt-5 rounded-md bg-surface-2 px-3.5">
        <RegionRow icon={Clock} title={`${tzOption(v.timezone).label} · ${tzOffset(v.timezone).label}`} sub={same ? 'Time zone, from this device' : 'Time zone'}
          open={open === 'tz'} onToggle={() => setOpen(open === 'tz' ? null : 'tz')}>
          <TimezonePicker id={`${id}-tz`} value={v.timezone} onChange={(z) => { set('timezone', z); setOpen(null) }} options={timezones} suggested={[deviceTz]} triggerClassName={PICKER} />
        </RegionRow>
        <RegionRow icon={Wallet} title={`${cur} · ${currencySign(cur)}`} sub="Currency for totals"
          open={open === 'cur'} onToggle={() => setOpen(open === 'cur' ? null : 'cur')}>
          <CurrencyPicker id={`${id}-cur`} value={v.baseCurrency} onChange={(c) => { set('baseCurrency', c); setOpen(null) }} options={currencies} suggested={[suggested?.cur]} triggerClassName={PICKER} />
        </RegionRow>
      </motion.div>
    </>
  )
}

// ── 2 · Pack ───────────────────────────────────────────────────────────────────────────────────────
/** What a pack brings, as the rows of its card. Empty rows are left out. */
export function packRows(p: Pack, sourceName: (id: string) => string | undefined): { k: string; v: string }[] {
  const t = p.targets
  const targets = [t?.steps ? `Steps ${nfIN.format(t.steps)}` : '', t?.sleepHours ? `Sleep ${t.sleepHours} h` : '', ...p.trackers.map((x) => x.name)].filter(Boolean)
  return [
    { k: 'Routines', v: p.routines.map((r) => r.name).join(' · ') },
    { k: 'Targets', v: targets.join(' · ') },
    { k: 'Goal', v: p.goals[0]?.title ?? '' },
    { k: 'Sources', v: (p.sources ?? []).flatMap((id) => sourceName(id) ?? []).slice(0, 3).join(', ') },
  ].filter((r) => r.v)
}

/** One choice of the Pack step: a radio card with the capsule, a one-line promise and what it brings. */
function PackCard({ on, onPick, icon, color, name, blurb, rows }: {
  on: boolean; onPick: () => void; icon: LucideIcon; color: string; name: string; blurb: string; rows: { k: string; v: string }[]
}) {
  return (
    <li>
      {/* Concentric: radius 16 card, 12px padding. */}
      <button type="button" role="radio" aria-checked={on} onClick={onPick}
        className={cn('relative flex w-full items-start gap-3 rounded-[16px] p-3 text-start', choice, on ? PICKED : IDLE)}>
        <CapsuleIcon color={color} icon={icon} size="sm" className="mt-0.5 ms-1" />
        <span className="min-w-0 flex-1 pe-7">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-body font-semibold text-ink">{name}</span>
            <span className="text-caption text-ink-3">{blurb}</span>
          </span>
          {rows.length ? (
            <dl className="mt-1.5 grid grid-cols-[4.75rem_minmax(0,1fr)] gap-x-3 gap-y-0.5">
              {rows.map((r) => (
                <div key={r.k} className="contents">
                  <dt className="pt-0.5 font-mono text-label text-ink-3 uppercase">{r.k}</dt>
                  <dd className="text-caption text-ink-2">{r.v}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </span>
        <span className="absolute end-3 top-3"><Tick on={on} /></span>
      </button>
    </li>
  )
}

/** The Pack step: four starter packs and Custom. A pack fills the next steps in; every one stays editable. */
export function StepPack({ v, packs, sourceName, onPick }: { v: V; packs: Pack[]; sourceName: (id: string) => string | undefined; onPick: (id: string | null) => void }) {
  return (
    <>
      <Title step={AT.pack} title="Pick a starting pack" body="Each pack adds areas, routines, targets and a first goal to approve. You can change all of it." />
      <motion.ul variants={item} role="radiogroup" aria-label="Starting pack" className="flex flex-col gap-2">
        {packs.map((p) => (
          <PackCard key={p.id} on={v.pack === p.id} onPick={() => onPick(p.id)} icon={AREA_ICON[p.areas?.[0] ?? 'health']} color={CATEGORY[p.areas?.[0] ?? 'health'].color}
            name={p.name} blurb={PACK_BLURB[p.id] ?? ''} rows={packRows(p, sourceName)} />
        ))}
        <PackCard on={v.pack === null} onPick={() => onPick(null)} icon={SlidersHorizontal} color="var(--pill)" name="Custom" blurb={CUSTOM_BLURB} rows={[]} />
      </motion.ul>
    </>
  )
}

// ── 3 · Areas ───────────────────────────────────────────────────────────────────────────────────────
export function StepAreas({ v, set, picks, options, onRefuse }: { v: V; set: Set; picks: string[]; options: typeof IMPROVE; onRefuse: () => void }) {
  const toggleArea = (c: Category) => {
    const next = AREAS.filter((x) => (x === c) !== v.areas.includes(x))
    set('areas', next)
    if (v.focus && !next.includes(v.focus)) set('focus', undefined)
  }
  const full = picks.length >= MAX_IMPROVE
  const toggleTrain = (id: string) => {
    if (picks.includes(id)) return set('improve', picks.filter((x) => x !== id))
    if (full) return onRefuse()
    set('improve', [...picks, id])
  }
  return (
    <>
      <Title step={AT.areas} title="Pick your areas" body="Each one gets a page, quests and suggested apps. Change it any time." />
      <motion.ul variants={item} className="grid grid-cols-2 gap-2">
        {AREAS.map((c) => {
          const on = v.areas.includes(c)
          return (
            <li key={c}>
              {/* Concentric: radius 16 tile, 12px padding. */}
              <button type="button" role="checkbox" aria-checked={on} onClick={() => toggleArea(c)}
                className={cn('relative flex min-h-[84px] w-full items-start gap-3 rounded-[16px] p-3 text-start', choice, on ? PICKED : IDLE)}>
                <CapsuleIcon color={CATEGORY[c].color} icon={AREA_ICON[c]} size="sm" className="mt-0.5 ms-1" />
                <span className="min-w-0 flex-1 pe-5">
                  <span className="block truncate text-body font-semibold text-ink">{CATEGORY[c].label}</span>
                  <span className="mt-0.5 block text-caption text-ink-3">{AREA_BLURB[c]}</span>
                </span>
                <span className="absolute end-2.5 top-2.5"><Tick on={on} /></span>
              </button>
            </li>
          )
        })}
      </motion.ul>

      <Group label="Improve first" aside={`${picks.length} of ${MAX_IMPROVE} · The System trains these`}>
        {options.length ? (
          <ul className="flex flex-wrap gap-2">
            {options.map((o) => {
              const rank = picks.indexOf(o.id) + 1
              const on = rank > 0
              return (
                <li key={o.id}>
                  {/* A 36px capsule with a 40px hit area. Picked: its dot swaps for its priority number. */}
                  <button type="button" role="checkbox" aria-checked={on} onClick={() => toggleTrain(o.id)}
                    className={cn('relative inline-flex h-9 items-center gap-2 rounded-full ps-3 pe-3.5 text-small font-medium text-ink after:absolute after:inset-[-2px]', choice, on ? PICKED : IDLE, !on && full && 'opacity-50')}>
                    <span aria-hidden className="relative grid size-4 shrink-0 place-items-center">
                      <AnimatePresence initial={false} mode="popLayout">
                        {on ? (
                          <motion.span key="rank" {...SWAP} className="absolute inset-0 grid place-items-center rounded-full bg-pill text-label leading-none text-white tabular-nums">{rank}</motion.span>
                        ) : (
                          <motion.span key="dot" {...SWAP} className="size-2 rounded-full" style={{ background: CATEGORY[o.area].color }} />
                        )}
                      </AnimatePresence>
                    </span>
                    {o.label}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="rounded-md bg-surface-2 p-3 text-small text-ink-2">Nothing to pick for these areas yet. The System will learn from what you log and pick for you.</p>
        )}
      </Group>
    </>
  )
}

// ── 4 · Connect ─────────────────────────────────────────────────────────────────────────────────────
/** The one thing you need at hand, said in a few words. */
const howNote = (c: ConnectorItem) =>
  c.oauth ? 'sign-in' : c.login ? 'Chrome login on your Mac' : c.fields.some((f) => f.secret && !f.optional) ? 'token' : c.fields.length ? 'username, no key' : 'a Shortcut'

/** One source: its logo and what it brings in, then the one control that fits how it connects. */
function SourceRow({ c }: { c: ConnectorItem }) {
  const how = connectHow(c)
  const sub = [c.provides.slice(0, 3).join(', '), howNote(c)].filter(Boolean).join(' · ')
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <AppLogo id={c.id} category={c.category} size="sm" />
      <div className="min-w-0 flex-1 self-center">
        <p className="truncate text-body font-semibold text-ink">{c.name}</p>
        {c.connected || how !== 'inline' ? <p className="line-clamp-2 text-caption text-ink-3">{c.connected ? `Connected · ${c.statusLabel ?? 'first sync starting'}` : sub}</p> : null}
        {/* A username is one field, checked when you press Connect. */}
        {!c.connected && how === 'inline' ? <div className="mt-1.5"><InlineUsernameConnect c={c} /></div> : null}
      </div>
      {c.connected ? (
        <span role="img" aria-label="Connected" className="grid size-6 shrink-0 place-items-center self-center rounded-full bg-good text-white"><Check className="size-3.5" strokeWidth={3} /></span>
      ) : how === 'later' ? (
        <span className="inline-flex h-7 shrink-0 items-center self-center rounded-full bg-surface-2 px-2.5 text-caption font-medium text-ink-2">Later</span>
      ) : how === 'dialog' ? (
        <span className="shrink-0 self-center"><ConnectorDialog c={c} trigger={<Button variant="secondary">{c.fields.length ? 'Connect' : 'Set up'}</Button>} /></span>
      ) : null}
    </li>
  )
}

export function StepConnect({ rows }: { rows: ConnectorItem[] }) {
  return (
    <>
      <Title step={AT.connect} title="Connect what you use" body="Picked from your areas. Skip any: they wait on Today’s setup list." />
      {rows.length ? (
        <motion.ul variants={item} className="divide-y divide-divider rounded-lg bg-surface shadow-1">
          {rows.map((c) => <SourceRow key={c.id} c={c} />)}
        </motion.ul>
      ) : (
        <motion.p variants={item} className="rounded-md bg-surface-2 p-3 text-small text-ink-2">Nothing to connect yet. Every source is in You › Connections whenever you want one.</motion.p>
      )}
      <motion.p variants={item} className="mt-4 flex items-start gap-2 text-caption text-ink-3">
        <Lock aria-hidden className="mt-px size-3.5 shrink-0" strokeWidth={1.5} />Keys stay encrypted on your Mac. Usernames need no key.
      </motion.p>
    </>
  )
}

// ── 5 · AI ─────────────────────────────────────────────────────────────────────────────────────────
/** "localhost:11434" from "http://localhost:11434/v1". */
const hostOf = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/v1\/?$/, '')

/** The answer of the check under the free local AI card. */
function LocalStatus({ local, checking, onCheck, onCloud }: { local: LocalAiResult | null; checking: boolean; onCheck: () => void; onCloud: () => void }) {
  if (checking || !local) {
    return <p role="status" className="flex items-center gap-2 text-small text-ink-2"><LoaderCircle aria-hidden className="size-4 animate-spin [animation-duration:0.7s]" />Looking for Ollama…</p>
  }
  if (!local.ok) return <p role="alert" className="text-small text-bad">{local.error}</p>
  const host = hostOf(local.url)
  if (local.state === 'ok') {
    return (
      <div role="status">
        <div className="flex items-center gap-3 rounded-md bg-surface p-3 shadow-1">
          <AppLogo id="local" size="xs" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-small font-semibold text-ink">Ollama is running</span>
            <span className="block truncate text-caption text-ink-3">{local.model} on {host}</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-caption font-medium text-good"><Check aria-hidden className="size-3.5" strokeWidth={2.5} />Ready</span>
        </div>
        <p className="mt-2 flex items-start gap-2 text-caption text-ink-3"><Lock aria-hidden className="mt-px size-3.5 shrink-0" strokeWidth={1.5} />Answered in {local.ms} ms. Free and offline; slower on older machines.</p>
      </div>
    )
  }
  return (
    <div role="alert" className="rounded-md bg-surface-2 p-3">
      <p className="flex items-start gap-2 text-small font-semibold text-ink">
        <CircleAlert aria-hidden className="mt-px size-4 shrink-0 text-bad" strokeWidth={1.5} />
        {local.state === 'no-model' ? 'Ollama is running without the model' : 'Can’t reach Ollama'}
      </p>
      <p className="mt-1 ps-6 text-caption text-ink-2"><Cmd text={local.message ?? ''} /></p>
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 ps-6">
        <Button variant="secondary" size="sm" onClick={onCheck}><RefreshCw aria-hidden className="size-3.5" strokeWidth={2} />Try again</Button>
        <button type="button" onClick={onCloud} className={LINK}>Use a cloud key instead</button>
      </p>
    </div>
  )
}

/** One radio of the AI step: its header is the radio, what opens under it (when picked) is its own content. */
function AiOption({ on, onPick, title, sub, chip, children }: { on: boolean; onPick: () => void; title: string; sub: string; chip?: string; children?: React.ReactNode }) {
  return (
    <li className={cn('rounded-[16px] transition-[background-color,box-shadow] duration-150 ease-out-quint', on ? PICKED : 'bg-surface shadow-1')}>
      <button type="button" role="radio" aria-checked={on} onClick={onPick} className={cn('flex w-full items-start gap-3 rounded-[16px] p-3.5 text-start', choice)}>
        <span aria-hidden className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full', on ? 'bg-pill' : 'shadow-[inset_0_0_0_1.5px_var(--hairline)]')}>
          {on ? <span className="size-2 rounded-full bg-white" /> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-body font-semibold text-ink">{title}</span>
            {chip ? <span className="rounded-full bg-pill/10 px-2 py-0.5 text-label font-medium text-pill-ink">{chip}</span> : null}
          </span>
          <span className="mt-0.5 block text-caption text-pretty text-ink-3">{sub}</span>
        </span>
      </button>
      {on && children ? <div className="px-3.5 pb-3.5 ps-[3.25rem]">{children}</div> : null}
    </li>
  )
}

/**
 * The AI step. With a model already connected it is one line of confirmation. Otherwise: free local AI (checked when it
 * is picked, saved when Continue is pressed), a cloud key (each provider opens its own connect dialog), or none.
 * Without a model, everything but Ask, nudges and goal drafts runs on rules.
 */
export function StepAi({ v, set, ai, providers, local, checking, onCheck }: {
  v: V; set: Set; ai: Ai | null; providers: ConnectorItem[]
  local: LocalAiResult | null; checking: boolean; onCheck: () => void
}) {
  const cloud = providers.filter((p) => p.id !== 'local')
  const pick = (c: NonNullable<V['aiChoice']>) => { set('aiChoice', c); if (c === 'local' && !local && !checking) onCheck() }
  const picked = v.aiChoice ?? 'local'
  return (
    <>
      <Title step={AT.ai} title="Pick an AI for your coach" body="It suggests routines, writes weekly reviews and answers Ask. Optional: everything else runs without one." />
      {ai?.ready ? (
        <motion.div variants={item} className="flex items-center gap-3 rounded-lg bg-surface p-4 shadow-1">
          <span role="img" aria-label="Connected" className="grid size-6 shrink-0 place-items-center rounded-full bg-good text-white"><Check className="size-3.5" strokeWidth={3} /></span>
          <p className="min-w-0 text-small text-ink-2"><span className="block font-semibold text-ink">A model is connected{ai.model ? `: ${ai.model}` : ''}</span>Change it any time in You › Connections.</p>
        </motion.div>
      ) : (
        <motion.ul variants={item} role="radiogroup" aria-label="AI for your coach" className="flex flex-col gap-2">
          <AiOption on={picked === 'local'} onPick={() => pick('local')} title="Use free local AI" chip="Recommended"
            sub="Ollama on this machine. Free and private: prompts never leave it.">
            <LocalStatus local={local} checking={checking} onCheck={onCheck} onCloud={() => pick('cloud')} />
          </AiOption>
          <AiOption on={picked === 'cloud'} onPick={() => pick('cloud')} title="Connect a cloud key"
            sub="Anthropic, OpenAI, Google or OpenRouter. Sharper answers; prompts go to that provider with account numbers masked.">
            <div className="flex flex-wrap items-center gap-2">
              {cloud.map((p) => (
                <ConnectorDialog key={p.id} c={p} trigger={
                  <button type="button" aria-label={`Connect ${p.name}`} title={p.name} className={cn("relative rounded-[10px] after:absolute after:-inset-1 after:content-['']", choice, 'hover:opacity-80')}>
                    <AppLogo id={p.id} size="xs" />
                  </button>
                } />
              ))}
              <span className="text-caption text-ink-3">Pick one to paste its key</span>
            </div>
          </AiOption>
          <AiOption on={picked === 'skip'} onPick={() => pick('skip')} title="Skip for now"
            sub="Nudges and quests run on rules. Add a model any time in You › Connections." />
        </motion.ul>
      )}
    </>
  )
}

// ── 6 · Routines and targets ────────────────────────────────────────────────────────────────────────
// Limits match what the server accepts.
const SLEEP = { min: 5, max: 10, step: 0.5 }
const STEPS_RANGE = { min: 1000, max: 30000, step: 1000 }
const WATER = { min: 500, max: 6000, step: 250 }

/** One line of the day card: what it is on the left, its control on the right. Lines are divided by hairlines. */
function Line({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 border-divider px-4 py-1.5 not-first:border-t">
      <span className="flex min-w-0 items-center gap-3 text-body font-semibold text-ink"><Icon aria-hidden className="size-4 shrink-0 text-ink-2" strokeWidth={1.5} />{label}</span>
      {children}
    </div>
  )
}

/** The beUI stepper in a number's own unit. Its blob is filled from `--background`, set to the card's grey well here. */
function Target({ label, value, onChange, range, text }: { label: string; value: number; onChange: (n: number) => void; range: { min: number; max: number; step: number }; text: (n: number) => string }) {
  return (
    <div className="[--background:var(--surface-2)]">
      <AdaptiveStepper value={value} onValueChange={onChange} min={range.min} max={range.max} step={range.step} aria-label={label} formatValueText={text}>
        <AdaptiveStepperDecrement aria-label={`${label}, less`} />
        <AdaptiveStepperValue className="px-1 text-sm whitespace-nowrap">{(n) => text(n)}</AdaptiveStepperValue>
        <AdaptiveStepperIncrement aria-label={`${label}, more`} />
      </AdaptiveStepper>
    </div>
  )
}

/** What the AI is told: everything said so far. */
const brief = (v: V) => [
  `I wake up around ${v.wake} and go to bed around ${v.sleep}.`,
  v.improve.length ? `I most want to: ${v.improve.map((id) => IMPROVE.find((o) => o.id === id)?.label.toLowerCase()).filter(Boolean).join(', ')}.` : '',
  v.goals.trim() ? `My goals: ${v.goals.trim()}.` : '',
  v.constraints.trim() ? `Work around: ${v.constraints.trim()}.` : '',
].filter(Boolean).join(' ').slice(0, 1500)

/** One routine: its colour dot, its name, when it runs, and a switch. One you already have lies flat. */
function RoutineLine({ t, sub, on, have, onToggle }: { t: Template; sub: string; on: boolean; have?: boolean; onToggle: () => void }) {
  return (
    <li className="flex min-h-14 items-center gap-3 px-4 py-2">
      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[8px]" style={{ background: `color-mix(in oklch, ${CATEGORY[t.area].color} 14%, transparent)` }}>
        <RoutineArt name={t.name} kind={t.kind} area={t.area} className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-body font-semibold', have ? 'text-ink-2' : 'text-ink')}>{t.name}</span>
        <span className="block truncate text-caption text-ink-3">{have ? 'Already added' : sub}</span>
      </span>
      {have ? <Check aria-label="Already added" className="size-4 shrink-0 text-ink-3" strokeWidth={2} /> : <Switch checked={on} onCheckedChange={onToggle} ariaLabel={t.name} />}
    </li>
  )
}

const SKELETON = (
  <ul role="status" aria-label="Suggesting routines" className="divide-y divide-divider rounded-lg bg-surface shadow-1">
    {[0, 1, 2, 3].map((k) => <li key={k} className="flex min-h-14 items-center gap-3 px-4"><div className="size-8 animate-pulse rounded-[8px] bg-surface-2" /><div className="h-4 w-40 animate-pulse rounded-full bg-surface-2" style={{ animationDelay: `${k * 100}ms` }} /></li>)}
  </ul>
)

export function StepRoutines({ v, set, mode, kind, building, setBuilding, starters, existing, today, ai, picksSig }: {
  v: V; set: Set
  /** What was asked for: the model's list when one is connected, else the starter list. */
  mode: 'ai' | 'starter'
  /** What is on screen: the model's list, or the starter list (asked for, or after the model failed). */
  kind: 'ai' | 'starter'
  building: boolean; setBuilding: (b: boolean) => void
  starters: Template[]; existing: string[]; today: string; ai: Ai | null; picksSig: string
}) {
  const [err, setErr] = useState<string | null>(null)
  const [all, setAll] = useState(false)
  const toggle = (id: string) => set('templates', v.templates.includes(id) ? v.templates.filter((x) => x !== id) : [...v.templates, id])
  const when = (t: Template) => `${describe(buildRRule({ ...t.rule, start: today }))}${t.note ? ` · ${t.note}` : ''}${t.dose ? ` · ${t.dose}` : ''}`

  // Hours and targets. The sleep target follows the night until the user picks one themselves.
  const move = (k: 'wake' | 'sleep', t: string) => {
    set(k, t)
    if (!v.sleepTouched) set('sleepHours', fitSleep(nightHours(k === 'sleep' ? t : v.sleep, k === 'wake' ? t : v.wake)))
  }
  const inBed = nightHours(v.sleep, v.wake)
  const hours = (k: 'wake' | 'sleep') => halfHours(v[k])

  const build = async () => {
    setBuilding(true); setErr(null)
    set('generatedFor', picksSig)
    // A failed call (network, server) must still end the skeleton and offer Try again.
    const r = await suggestOnboardingRoutines({ prompt: brief(v), areas: v.areas, focus: v.focus, goals: v.goals })
      .catch(() => ({ ok: false as const, error: 'Couldn’t reach the model. Try again.' }))
    setBuilding(false)
    if (!r.ok) return setErr(r.error)
    set('generated', r.routines)
    set('templates', [...v.templates.filter((id) => !id.startsWith('ai-')), ...r.routines.slice(0, 3).map((x) => x.id)])
  }

  // Both lists are decided on arrival: the model builds from what was said so far (again if the picks changed),
  // and the starter list ticks its suggested few once.
  useEffect(() => {
    if (!ai) return
    if (mode === 'ai' && ai.ready && v.generatedFor !== picksSig) void build()
    if (kind === 'starter' && !v.starterSeeded) {
      set('starterSeeded', true)
      set('templates', [...v.templates, ...startersOn(starters, existing)])
    }
  }, [ai, mode, kind, picksSig]) // eslint-disable-line react-hooks/exhaustive-deps -- runs when the answer to "which list" changes, reads the rest as it is

  const aiList = kind === 'ai' && v.generated.length > 0
  const ordered = [...starters].sort((a, b) => Number(!!b.suggested) - Number(!!a.suggested))
  const shown = all ? ordered : ordered.filter((t) => t.suggested || v.templates.includes(t.id))
  const onCount = v.templates.filter((id) => (kind === 'ai') === id.startsWith('ai-')).length

  return (
    <>
      <Title step={AT.routines} title="Routines and targets" />
      <motion.div variants={item} className="rounded-lg bg-surface shadow-1">
        <Line icon={Sun} label="Your day">
          <span className="flex items-center gap-2">
            <Select variant="pill" className={PILL_HIT} aria-label="Wake up" value={v.wake} onChange={(e) => move('wake', e.target.value)}>
              {hours('wake').map((t) => <option key={t} value={t}>Up {t}</option>)}
            </Select>
            <Select variant="pill" className={PILL_HIT} aria-label="Bedtime" value={v.sleep} onChange={(e) => move('sleep', e.target.value)}>
              {hours('sleep').map((t) => <option key={t} value={t}>Bed {t}</option>)}
            </Select>
          </span>
        </Line>
        <Line icon={BedDouble} label="Sleep">
          <Target label="Sleep target" value={v.sleepHours} range={SLEEP} text={(n) => `${n} h`} onChange={(n) => { set('sleepHours', n); set('sleepTouched', true) }} />
        </Line>
        <Line icon={Footprints} label="Steps">
          <Target label="Steps target" value={v.steps} range={STEPS_RANGE} text={(n) => nfIN.format(n)} onChange={(n) => set('steps', n)} />
        </Line>
        {v.areas.includes('health') ? (
          <Line icon={Droplet} label="Water">
            <Target label="Water target" value={v.waterMl} range={WATER} text={(n) => `${nfIN.format(n)} ml`} onChange={(n) => set('waterMl', clamp(n, WATER.min, WATER.max))} />
          </Line>
        ) : null}
      </motion.div>
      <motion.p variants={item} aria-live="polite" className={cn('mt-2 px-1 text-caption', v.sleepHours <= inBed - 0.25 ? 'text-ink-3' : 'font-medium text-warn')}>
        {v.sleepHours <= inBed - 0.25 ? `${inBed}h in bed, so we’ll aim for ${v.sleepHours}h of sleep. Reminders stay quiet while you sleep.` : `${inBed}h in bed is tight for ${v.sleepHours}h of sleep.`}
      </motion.p>

      <Group label={kind === 'ai' ? 'Suggested from your focus' : 'Start with these'} aside={`${onCount} on · edit any time in Plan`}>
        {!ai || building ? SKELETON : aiList ? (
          <>
            <ul className="divide-y divide-divider rounded-lg bg-surface shadow-1">
              {v.generated.map((g) => <RoutineLine key={g.id} t={g} sub={g.why} on={v.templates.includes(g.id)} onToggle={() => toggle(g.id)} />)}
            </ul>
            <p className="mt-3 flex justify-between gap-3 text-caption text-ink-3">
              <button type="button" onClick={() => void build()} className={LINK}>Suggest again</button>
              <button type="button" onClick={() => set('routineMode', 'starter')} className={LINK}>Use the starter list</button>
            </p>
          </>
        ) : (
          <>
            {mode === 'ai' ? (
              <p role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-md bg-surface-2 px-3 py-2 text-caption text-ink-2">
                <span className="min-w-0">{err ?? 'No suggestions came back, so here is the starter list.'}</span>
                <button type="button" onClick={() => void build()} className={cn(LINK, 'shrink-0')}>Try again</button>
              </p>
            ) : null}
            {ordered.length ? (
              <ul className="divide-y divide-divider rounded-lg bg-surface shadow-1">
                {shown.map((t) => <RoutineLine key={t.id} t={t} sub={when(t)} have={existing.includes(t.name.toLowerCase())} on={v.templates.includes(t.id)} onToggle={() => toggle(t.id)} />)}
              </ul>
            ) : (
              <p className="rounded-md bg-surface-2 p-3 text-small text-ink-2">No starter routines for these areas. Add your own any time in Plan.</p>
            )}
            <p className="mt-3 flex justify-between gap-3">
              {ordered.length > shown.length || all ? <button type="button" onClick={() => setAll(!all)} className={LINK}>{all ? 'Show fewer' : `Show ${ordered.length - shown.length} more`}</button> : <span />}
              {ai.ready && mode === 'starter' ? <button type="button" onClick={() => set('routineMode', 'ai')} className={cn(LINK, 'inline-flex items-center gap-1')}><Sparkles aria-hidden className="size-3.5" strokeWidth={1.5} />Suggest from my focus</button> : null}
            </p>
          </>
        )}
      </Group>
    </>
  )
}
