'use client'

import { AnimatePresence, motion, type Variants } from 'motion/react'
import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { ArrowLeft, ArrowRight, Check, CornerDownLeft, LoaderCircle, Minus, Moon, Plus, Sparkles, Star, Sun, type LucideIcon } from 'lucide-react'
import type { Category } from '@/db/schema'
import type { Template } from '@/core/onboarding'
import { buildRRule, describe } from '@/domain/recurrence'
import { aiReady, connectIntegration, finishOnboarding, skipOnboardingAction, suggestOnboardingRoutines } from '@/app/actions'
import { CATEGORY } from '../tokens'
import { Button, buttonClass } from './button'
import { Field, Input, Select, Textarea } from './form'
import { CurrencyPicker, TimezonePicker } from './region-picker'
import { CapsuleMark, Wordmark } from './logo'
import { AREA_ICON } from './capsule-icon'
import { IconChip } from './card'
import { RoutineArt } from './routine-art'
import { Backdrop, DayBar, SaveFile, SaveStrip } from './onboarding-preview'
import {
  IMPROVE, LAST, MAX_IMPROVE, STEPS, TONES, canonTz, city, clamp, firstName, fitSleep, fromMin, litres, nfIN, nightHours, toMin,
  type Initial, type Level, type V,
} from './onboarding-data'
import { cn } from '../cn'
import { EASE_OUT, EASE_OUT_STRONG, SPRING_LAYOUT } from '@/ui/beui/lib/ease'
import { DigitSwap } from '@/ui/beui/motion/digit-swap'

// One-time setup, as a split screen. On the left, one short group of questions at a time: five steps,
// each filled in already so Enter walks straight through. On the right, the player's save file builds
// itself from the answers (onboarding-preview.tsx), so every choice shows what it changes. On a phone the
// preview shrinks to one line above the questions. Answers survive a reload until setup is finished.
// When it's done, "Show me around" opens the tour straight at its first stop: no second welcome.
// The questions use the app's own controls (Field, Input, Select, Button, IconChip) at their usual sizes.

const SPRING = { type: 'spring', duration: 0.3, bounce: 0 } as const
// Icon swaps: scale 0.25→1, opacity 0→1, blur 4px→0.
const SWAP = { initial: { scale: 0.25, opacity: 0, filter: 'blur(4px)' }, animate: { scale: 1, opacity: 1, filter: 'blur(0px)' }, exit: { scale: 0.25, opacity: 0, filter: 'blur(4px)' }, transition: SPRING }

// Seen once, so it can afford a little delight: a step slides the way you're going and its heading
// and answers arrive one after another. Choices themselves respond at once (≤150ms).
const stepMotion: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 20 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.35, ease: EASE_OUT_STRONG, staggerChildren: 0.045, delayChildren: 0.02 } },
  // Exits are softer than enters: shorter distance, quicker.
  exit: (dir: number) => ({ opacity: 0, x: dir * -10, filter: 'blur(2px)', transition: { duration: 0.15, ease: EASE_OUT } }),
}
const item: Variants = {
  enter: { opacity: 0, y: 8, filter: 'blur(4px)' },
  center: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.4, ease: EASE_OUT_STRONG } },
  exit: {},
}

const AREAS = Object.keys(CATEGORY) as Category[]
const GOAL_IDEAS = ['Sleep 7.5 hours', 'Ship a side project', 'Save 30% of income', 'Read 12 books this year', 'Call family every week', 'Exercise 3 times a week']
const DRAFT = 'relife:setup-draft'

type Ai = { ready: boolean; model: string | null }
type Set = <K extends keyof V>(k: K, val: V[K]) => void

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill'
// A pickable thing looks like the app's secondary button until picked, then takes a capsule-blue wash
// and ring. Area colours stay in the icons.
const choice = cn('transition-[background-color,box-shadow,scale,opacity] duration-150 ease-out-quint active:scale-[0.96]', FOCUS)
const IDLE = 'bg-surface shadow-1 hover:bg-surface-2'
const PICKED = 'bg-pill-wash shadow-[0_0_0_1.5px_var(--pill)]'
// Text controls at 40px. 16px text on a phone: iOS zooms the page on anything smaller.
const CONTROL = 'h-10 text-[16px] sm:text-[14px]'
// The region pickers, at the same height and look as the name field.
const PICKER = 'h-10 rounded-md bg-surface px-3 text-[16px] shadow-1 focus-visible:shadow-[0_0_0_2px_var(--pill)] aria-expanded:shadow-[0_0_0_2px_var(--pill)] sm:text-[14px]'
const LINK = cn('relative rounded-sm text-[13px] font-medium text-ink underline decoration-ink/25 underline-offset-[3px] transition-[text-decoration-color] duration-150 ease-out-quint after:absolute after:-inset-x-2 after:-inset-y-2.5 hover:decoration-ink', FOCUS)

export function OnboardingFlow({ initial, templates, existing, timezones, currencies, today, fresh }: {
  initial: Initial; templates: Template[]; existing: string[]; timezones: string[]; currencies: string[]; today: string
  /** First time through (finishing clears earlier XP for a fresh start at Level 1): start from this device's time zone. */
  fresh: boolean
}) {
  const [i, setI] = useState(0)
  const [dir, setDir] = useState(1)
  const [v, setV] = useState<V>({
    ...initial,
    areas: initial.areas.length ? initial.areas : (['health', 'mind', 'skills'] as Category[]),
    // Nothing picked until the user builds or ticks some: no generic routines by default.
    templates: [], generated: [], prompt: '', routineMode: null,
    // The sleep target follows the night they describe until they pick one themselves.
    sleepTouched: false,
  })
  const [error, setError] = useState<string | null>(null)
  const [nudge, setNudge] = useState(0) // bumps when a fourth training pick is refused, to shake the line
  const [pending, start] = useTransition()
  const [result, setResult] = useState<Level | null>(null)
  const done = !!result
  const go = useRef<HTMLAnchorElement>(null)
  const pane = useRef<HTMLDivElement>(null)
  const [ai, setAi] = useState<Ai | null>(null)
  useEffect(() => { aiReady().then(setAi) }, [])

  // After mount: pick up a draft from this tab (a reload keeps every answer), else start from this device's
  // time zone. (Its currency would only be a guess from the browser's language, so that is just suggested
  // in the picker.) Questions show once this has run, so a restored draft never flashes the first step.
  const [device, setDevice] = useState<{ tz: string; cur: string | null } | null>(null)
  const [ready, setReady] = useState(false)
  const base = JSON.stringify({ initial, fresh })
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const region = new Intl.Locale(navigator.language).maximize().region
    setDevice({ tz, cur: region ? REGION_CURRENCY[region] ?? null : null })
    // A draft only counts while the saved settings it started from are unchanged; otherwise it could
    // put back values the user has since changed in Settings.
    let draft: { v: V; i: number; base: string } | null = null
    try { draft = JSON.parse(sessionStorage.getItem(DRAFT) ?? 'null') } catch { /* a broken draft starts over */ }
    if (draft?.v && typeof draft.i === 'number' && draft.base === base) {
      setV((s) => ({ ...s, ...draft.v }))
      setI(clamp(draft.i, 0, LAST))
    } else if (fresh && canonTz(tz)) {
      // Only when it really is another zone: browsers call Asia/Kolkata by its old name, Asia/Calcutta.
      setV((s) => (canonTz(s.timezone) === canonTz(tz) ? s : { ...s, timezone: tz }))
    }
    setReady(true)
  }, [fresh, base])
  useEffect(() => {
    if (ready && !done) sessionStorage.setItem(DRAFT, JSON.stringify({ v, i, base }))
  }, [ready, done, v, i, base])

  const set: Set = (k, val) => { setV((s) => ({ ...s, [k]: val })); setError(null); setNudge(0) }
  const options = IMPROVE.filter((o) => v.areas.includes(o.area))
  const picks = v.improve.filter((id) => options.some((o) => o.id === id))
  const mode = v.routineMode ?? (ai?.ready ? 'ai' : 'starter')
  // Each routine list keeps its own ticks; only the list on screen is created.
  const routines = v.templates.filter((id) => (mode === 'ai') === id.startsWith('ai-'))
  const starters = v.areas.flatMap((c) => templates.filter((t) => t.area === c))

  const check = (): string | null => {
    if (i === 0 && !v.name.trim()) return 'Type your name to continue'
    if (i === 0 && !canonTz(v.timezone)) return 'Pick a time zone from the list'
    if (i === 0 && !currencies.includes(v.baseCurrency.toUpperCase())) return 'Pick a currency from the list'
    if (i === 2 && !v.areas.length) return 'Pick at least one area'
    return null
  }
  // The button looks unavailable until the step has its answer; pressing it anyway says what's missing.
  const valid = !check()
  const to = (k: number) => {
    setDir(k > i ? 1 : -1); setI(k); setError(null); setNudge(0)
    pane.current?.scrollTo({ top: 0 })
  }
  const next = () => {
    const e = check()
    if (e) return setError(e)
    if (i < LAST) return to(i + 1)
    // Running setup again sends a setting only when it was changed here, so nothing is overwritten by accident.
    const changed = <K extends 'wake' | 'sleep' | 'sleepHours' | 'steps'>(k: K) => (fresh || v[k] !== initial[k] ? v[k] : undefined)
    const hours = fresh || v.wake !== initial.wake || v.sleep !== initial.sleep
    start(async () => {
      const r = await finishOnboarding({
        name: v.name, timezone: v.timezone, baseCurrency: v.baseCurrency.toUpperCase(), areas: v.areas,
        focus: v.focus && v.areas.includes(v.focus) ? v.focus : undefined, improve: picks,
        wake: hours ? v.wake : undefined, sleep: hours ? v.sleep : undefined,
        sleepHours: changed('sleepHours'), steps: changed('steps'), waterMl: v.waterMl,
        tone: v.tone, goals: v.goals, constraints: v.constraints,
        templates: routines, generated: v.generated,
      })
      if (!r.ok) return setError(r.error)
      sessionStorage.removeItem(DRAFT)
      setDir(1); setResult(r.level)
      pane.current?.scrollTo({ top: 0 })
      window.dispatchEvent(new Event('relife:celebrate'))
    })
  }
  const skip = () => start(async () => { sessionStorage.removeItem(DRAFT); await skipOnboardingAction(); window.location.assign('/') })
  useEffect(() => { if (done) go.current?.focus() }, [done])

  // Enter continues, like any form, except in multi-line fields. (A focused button keeps Enter for
  // itself; the pickers stop it.) Finishing takes a click.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.shiftKey || e.defaultPrevented || done || pending || i === LAST) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'BUTTON' || tag === 'TEXTAREA' || tag === 'A') return
      e.preventDefault(); next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // On the last step with the AI ready and nothing picked, building routines leads and finishing is the quiet choice.
  const quiet = i === LAST && mode === 'ai' && !!ai?.ready && !routines.length
  const inBed = nightHours(v.sleep, v.wake)
  // One line beside the action: what's missing, a count, or a note.
  const refused = i === 2 && nudge > 0
  const line = error ?? (done ? 'You can run setup again from Settings.'
    : i === 0 ? 'You can change all of this later in Settings.'
    : i === 1 ? (v.sleepHours <= inBed - 0.25 ? `${inBed}h in bed, so we’ll aim for ${v.sleepHours}h of sleep.` : `${inBed}h in bed is tight for ${v.sleepHours}h of sleep.`)
    : i === 2 ? (refused ? 'Up to three. Drop one to swap.' : `${v.areas.length} area${v.areas.length === 1 ? '' : 's'} · ${picks.length} of ${MAX_IMPROVE} to train`)
    : i === 3 ? (v.goals.trim() ? 'Your plans and routines read this.' : 'Goals are optional, but plans get sharper with them.')
    : routines.length ? `${routines.length} routine${routines.length === 1 ? '' : 's'} picked` : 'None picked. Add routines anytime in Habits.')

  return (
    <div className="fixed inset-0 z-[60] grid bg-bg lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* ── Questions ── */}
      {/* The scrollbar's room is kept on every step, so a long step doesn't push the column sideways. */}
      <div ref={pane} data-onboarding-scroll className="relative flex min-h-0 flex-col overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 bg-bg/85 px-5 pt-[env(safe-area-inset-top)] backdrop-blur-md sm:px-10">
          <Wordmark className="h-6" />
          {!done ? (
            <button type="button" onClick={skip} disabled={pending}
              className={cn('-me-3 h-10 rounded-md px-3 text-[14px] font-medium text-ink-3 transition-[color,scale] duration-150 ease-out-quint hover:text-ink active:scale-[0.96] disabled:opacity-50', FOCUS)}>
              Skip for now
            </button>
          ) : null}
        </header>

        <main className="mx-auto flex w-full max-w-[540px] flex-1 flex-col px-5 pb-10 sm:px-10">
          <Rail current={done ? STEPS.length : i} onJump={(k) => { if (!done && !pending && k < i) to(k) }} />
          <div className="mt-5 lg:hidden"><SaveStrip v={v} level={result} /></div>

          <div className="relative mt-8 flex-1 short:mt-6 lg:mt-12">
            <AnimatePresence mode="popLayout" custom={dir} initial={false}>
              {ready ? (
                <motion.section key={done ? 'done' : i} custom={dir} variants={stepMotion} initial="enter" animate="center" exit="exit" aria-live="polite">
                  {result ? <Done name={firstName(v.name)} level={result} />
                    : i === 0 ? <StepYou v={v} set={set} suggested={device} timezones={timezones} currencies={currencies} />
                    : i === 1 ? <StepDay v={v} set={set} />
                    : i === 2 ? <StepFocus v={v} set={set} picks={picks} options={options} onRefuse={() => setNudge((n) => n + 1)} />
                    : i === 3 ? <StepVoice v={v} set={set} />
                    : <StepRoutines v={v} set={set} mode={mode} starters={starters} existing={existing} today={today} ai={ai} onAi={setAi} />}
                </motion.section>
              ) : null}
            </AnimatePresence>
          </div>
        </main>

        {/* The action bar: back, one quiet line, and the one action, in the same place on every step. */}
        <footer className="sticky bottom-0 z-20 shrink-0 border-t border-divider bg-bg/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-[540px] items-center gap-3 px-5 py-4 sm:px-10">
            <AnimatePresence initial={false} mode="popLayout">
              {!done && i > 0 ? (
                <motion.span key="back" className="inline-flex" {...SWAP}>
                  <Button variant="secondary" size="icon" aria-label="Back" onClick={() => to(i - 1)} disabled={pending} className="size-10">
                    <ArrowLeft className="size-4 rtl:-scale-x-100" strokeWidth={2} />
                  </Button>
                </motion.span>
              ) : null}
            </AnimatePresence>
            {/* A refused pick shakes the line once. */}
            <motion.p key={nudge} role={error ? 'alert' : undefined} aria-live="polite"
              initial={false} animate={refused ? { x: [0, -5, 5, -3, 3, 0] } : { x: 0 }} transition={{ duration: 0.3, ease: EASE_OUT }}
              className={cn('min-w-0 flex-1 text-[12.5px] leading-[18px] text-pretty tabular-nums', error || refused ? 'font-medium text-bad' : 'text-ink-3 max-sm:flex-none')}>
              {/* On a phone only what's missing shows, so the bar stays one row. */}
              <span className={cn(!(error || refused) && 'max-sm:sr-only')}>{line}</span>
            </motion.p>
            {done ? (
              <div className="flex shrink-0 items-center gap-2">
                <a href="/" className={buttonClass({ variant: 'ghost', size: 'lg', className: 'h-10 px-3 text-[14px]' })}>{/* Short on a phone, so both fit. */}<span className="max-sm:hidden">Go to </span>Today</a>
                <a ref={go} href="/?tour=setup" className={buttonClass({ variant: 'primary', size: 'lg', className: 'h-10 text-[14px]' })}>
                  <span className="max-sm:hidden">Show me around</span><span className="sm:hidden">Take the tour</span><ArrowRight className="size-4 rtl:-scale-x-100" strokeWidth={2} />
                </a>
              </div>
            ) : (
              <Button variant={quiet ? 'secondary' : 'primary'} size="lg" onClick={next} disabled={pending} aria-disabled={!valid} aria-busy={pending}
                className={cn('h-10 min-w-[132px] text-[14px] aria-disabled:opacity-50', !(error || refused) && 'max-sm:flex-1')}>
                {pending ? <><LoaderCircle className="size-4 animate-spin [animation-duration:0.7s]" aria-hidden />Saving…</>
                  : i < LAST ? <>Continue<kbd aria-hidden className="ms-0.5 grid h-5 place-items-center rounded-[5px] bg-white/15 px-1 font-sans text-[11px] max-sm:hidden dark:bg-black/10"><CornerDownLeft className="size-3" strokeWidth={2} /></kbd></>
                  : <>Create my save<ArrowRight className="size-4 rtl:-scale-x-100" strokeWidth={2} /></>}
              </Button>
            )}
          </div>
        </footer>
      </div>

      {/* ── The save file, building itself ── */}
      <aside aria-label="Preview of your save file" className="relative hidden min-h-0 p-3 ps-0 lg:block">
        <div className="relative isolate h-full overflow-hidden rounded-[28px] bg-surface-2 shadow-inset">
          <Backdrop progress={done ? 1 : i / LAST} areas={v.areas} />
          <div className="relative flex h-full flex-col items-center overflow-y-auto px-8 py-10 [scrollbar-width:none]">
            <div className="my-auto flex w-full justify-center">
              <SaveFile v={v} step={done ? STEPS.length : i} done={done} level={result} picks={picks} routines={routines} starters={starters} />
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}

/** The five steps as labelled capsules. Finished ones jump back. */
function Rail({ current, onJump }: { current: number; onJump: (k: number) => void }) {
  return (
    <ol aria-label="Setup steps" className="grid grid-cols-5 gap-1.5">
      {STEPS.map((s, k) => {
        const state = k < current ? 'done' : k === current ? 'now' : 'next'
        return (
          <li key={s.key}>
            <button type="button" disabled={state !== 'done'} onClick={() => onJump(k)}
              aria-current={state === 'now' ? 'step' : undefined}
              aria-label={`Step ${k + 1} of ${STEPS.length}: ${s.label}${state === 'done' ? ' (done, go back)' : state === 'now' ? ' (current)' : ''}`}
              className="group flex w-full flex-col gap-2 rounded-md pt-2 pb-1 text-start disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill">
              <span className="relative block h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.08] dark:bg-white/[0.1]">
                {/* Slides instead of scaling, so the round end stays round. */}
                <span className={cn(
                  'absolute inset-0 rounded-full transition-[translate,background-color,opacity] duration-300 ease-[var(--ease-out-strong)] motion-reduce:transition-none group-enabled:group-hover:opacity-60',
                  state === 'next' ? '-translate-x-[101%]' : 'translate-x-0',
                  state === 'now' ? 'bg-pill' : 'bg-ink',
                )} />
              </span>
              <span className={cn('flex items-center gap-1 truncate text-[12px] leading-4 transition-[color] duration-150',
                state === 'now' ? 'font-semibold text-ink' : state === 'done' ? 'text-ink-2 group-hover:text-ink' : 'text-ink-3')}>
                {state === 'done' ? <Check aria-hidden className="size-3 shrink-0" strokeWidth={2.5} /> : null}
                {s.label}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/** The question: a small step label, a title and one line of help, each on its own beat. */
function Title({ step, title, body }: { step: number; title: string; body: string }) {
  return (
    <div className="mb-8 short:mb-6">
      <motion.p variants={item} className="font-mono text-[11px] leading-4 font-semibold tracking-[0.14em] text-pill-ink uppercase">
        Step {step + 1} of {STEPS.length}
      </motion.p>
      <motion.h1 variants={item} className="mt-2 font-display text-[28px] leading-[1.15] font-extrabold tracking-[-0.025em] text-balance text-ink sm:text-[32px]">{title}</motion.h1>
      <motion.p variants={item} className="mt-2 max-w-[420px] text-[15px] leading-normal text-pretty text-ink-2">{body}</motion.p>
    </div>
  )
}

/** A labelled group inside a step. */
function Group({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={item} className={cn('not-first:mt-8 short:not-first:mt-6', className)}>
      <h2 className="text-[13px] leading-5 font-semibold text-ink">{label}</h2>
      {hint ? <p className="text-[12.5px] leading-[18px] text-ink-3">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </motion.div>
  )
}

/** Check badge: a hollow ring until picked, then the tick pops in. */
function Tick({ on }: { on: boolean }) {
  return (
    <span aria-hidden className="relative grid size-5 shrink-0 place-items-center rounded-full shadow-[inset_0_0_0_1.5px_var(--hairline)]">
      <AnimatePresence initial={false}>
        {on ? (
          <motion.span key="on" {...SWAP} className="absolute inset-0 grid place-items-center rounded-full bg-pill text-white">
            <Check className="size-3" strokeWidth={3} />
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  )
}

/** A 3D picture (public/routines). It is the subject, so it gets no photo outline. */
function Art({ name, className }: { name: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- small local PNGs
  return <img src={`/routines/${name}.png`} alt="" width={256} height={256} className={cn('size-[18px] shrink-0 object-contain outline-none', className)} />
}

/**
 * A value with − and + beside it, as one 40px control. The digits roll the way the value moves; a
 * button dims at its limit.
 */
function Stepper({ label, text, onStep, low, high }: { label: string; text: string; onStep: (d: -1 | 1) => void; low?: boolean; high?: boolean }) {
  const [dir, setDir] = useState<'up' | 'down'>('up')
  const step = (d: -1 | 1) => { setDir(d > 0 ? 'up' : 'down'); onStep(d) }
  const btn = cn('grid h-10 w-10 place-items-center text-ink-2 transition-[color,background-color,scale,opacity] duration-150 ease-out-quint hover:bg-surface-2 hover:text-ink active:scale-[0.96] disabled:pointer-events-none disabled:opacity-35', FOCUS)
  return (
    <span role="group" aria-label={label} className="inline-flex h-10 shrink-0 items-center rounded-md bg-surface shadow-1">
      <button type="button" aria-label={`${label}, less`} disabled={low} onClick={() => step(-1)} className={cn(btn, 'rounded-s-md')}><Minus className="size-4" strokeWidth={2} /></button>
      <output aria-live="polite" aria-label={`${label} ${text}`} className="flex w-[72px] justify-center text-[14px] font-semibold text-ink tabular-nums">
        <DigitSwap value={text} direction={dir} />
      </output>
      <button type="button" aria-label={`${label}, more`} disabled={high} onClick={() => step(1)} className={cn(btn, 'rounded-e-md')}><Plus className="size-4" strokeWidth={2} /></button>
    </span>
  )
}

/** One line of a short list: what it is on the left, its control on the right. Lines are divided by hairlines. */
function Row({ lead, label, sub, children }: { lead: React.ReactNode; label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex h-14 items-center justify-between gap-3 border-divider not-first:border-t">
      <span className="flex min-w-0 items-center gap-3">
        {lead}
        <span className="min-w-0">
          <span className="block truncate text-[14px] leading-5 font-medium text-ink">{label}</span>
          {sub ? <span className="block truncate text-[12px] leading-4 text-ink-3">{sub}</span> : null}
        </span>
      </span>
      {children}
    </div>
  )
}

/** A few options in one row; the raised thumb glides to the pick. Concentric: radius 12 well, 4px padding, radius 8 options. */
function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: readonly { key: T; label: React.ReactNode }[]; value: T; onChange: (v: T) => void }) {
  const id = useId()
  return (
    <div role="radiogroup" aria-label={label} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} className="grid gap-1 rounded-md bg-surface-2 p-1">
      {options.map((o) => {
        const on = o.key === value
        return (
          <button key={o.key} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.key)}
            className={cn('relative grid h-8 place-items-center rounded-[8px] text-[13px] leading-none font-medium transition-[color,scale] duration-150 ease-out-quint active:scale-[0.96]', FOCUS, on ? 'text-ink' : 'text-ink-3 hover:text-ink')}>
            {on ? <motion.span layoutId={id} aria-hidden className="absolute inset-0 rounded-[8px] bg-surface shadow-1" transition={SPRING_LAYOUT} /> : null}
            <span className="relative flex items-center gap-1.5">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── 1 · You ─────────────────────────────────────────────────────────────────────────────────────────
function StepYou({ v, set, suggested, timezones, currencies }: {
  v: V; set: Set; suggested: { tz: string; cur: string | null } | null; timezones: string[]; currencies: string[]
}) {
  const id = useId()
  // Region comes filled in, so it is one line to confirm. "Change" opens the two pickers.
  const [open, setOpen] = useState(false)
  // Suggest this device's zone in the list only when it differs from the one in use.
  const deviceTz = suggested && canonTz(suggested.tz) !== canonTz(v.timezone) ? suggested.tz : null
  return (
    <>
      <Title step={0} title="Start your save file" body="ReLife turns your days into a character you level up. Setup takes about two minutes." />
      <motion.div variants={item}>
        <Field label="What should we call you?" htmlFor={`${id}-n`}>
          <Input id={`${id}-n`} value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="First name" autoComplete="given-name" maxLength={60} autoFocus className={CONTROL} />
        </Field>
      </motion.div>
      {/* Above what follows (each block is its own layer once it has animated in), so an open list covers it. */}
      <motion.div variants={item} className="relative z-20 mt-5">
        {open ? (
          <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
            <Field label="Time zone" htmlFor={`${id}-tz`}>
              <TimezonePicker id={`${id}-tz`} value={v.timezone} onChange={(z) => set('timezone', z)} options={timezones} suggested={[deviceTz]} triggerClassName={PICKER} />
            </Field>
            <Field label="Currency" htmlFor={`${id}-cur`}>
              <CurrencyPicker id={`${id}-cur`} value={v.baseCurrency} onChange={(c) => set('baseCurrency', c)} options={currencies} suggested={[suggested?.cur]} triggerClassName={PICKER} />
            </Field>
          </div>
        ) : (
          <div className="flex h-12 items-center justify-between gap-3 rounded-md bg-surface-2 px-3.5 text-[13px] leading-5">
            <span className="min-w-0 truncate text-ink-2"><span className="text-ink-3">Region </span><span className="font-medium text-ink">{city(v.timezone)} time · {v.baseCurrency.toUpperCase()}</span></span>
            <button type="button" onClick={() => setOpen(true)} className={cn(LINK, 'shrink-0')}>Change</button>
          </div>
        )}
      </motion.div>
    </>
  )
}

// ── 2 · Day ─────────────────────────────────────────────────────────────────────────────────────────
const Lead = ({ icon: Icon }: { icon: LucideIcon }) => <span aria-hidden className="grid size-8 place-items-center rounded-[8px] bg-surface-2"><Icon className="size-4 text-ink-2" strokeWidth={1.5} /></span>
const ArtLead = ({ name }: { name: string }) => <span aria-hidden className="grid size-8 place-items-center rounded-[8px] bg-surface-2"><Art name={name} className="size-5" /></span>
// Limits match what the server accepts.
const SLEEP = { lo: 5, hi: 10, by: 0.5 }
const STEPS_RANGE = { lo: 1000, hi: 30000, by: 1000 }
const WATER = { lo: 500, hi: 6000, by: 250 }

function StepDay({ v, set }: { v: V; set: Set }) {
  const move = (k: 'wake' | 'sleep', d: number) => {
    const t = fromMin(toMin(v[k]) + d * 30)
    set(k, t)
    if (!v.sleepTouched) set('sleepHours', fitSleep(nightHours(k === 'sleep' ? t : v.sleep, k === 'wake' ? t : v.wake)))
  }
  const bump = (k: 'sleepHours' | 'steps' | 'waterMl', r: { lo: number; hi: number; by: number }, d: number) => {
    set(k, clamp(v[k] + d * r.by, r.lo, r.hi))
    if (k === 'sleepHours') set('sleepTouched', true)
  }
  return (
    <>
      <Title step={1} title="Shape a good day" body="Reminders stay quiet while you sleep. Hitting these targets earns XP, so pick doable, not ideal." />
      <Group label="Your usual hours">
        <div>
          <Row lead={<Lead icon={Sun} />} label="Wake up"><Stepper label="Wake up" text={v.wake} onStep={(d) => move('wake', d)} /></Row>
          <Row lead={<Lead icon={Moon} />} label="Bedtime"><Stepper label="Bedtime" text={v.sleep} onStep={(d) => move('sleep', d)} /></Row>
        </div>
        <div className="mt-3"><DayBar wake={v.wake} sleep={v.sleep} /></div>
      </Group>
      <Group label="Daily targets" hint="Change them anytime in Habits.">
        <div>
          <Row lead={<ArtLead name="sleep" />} label="Sleep" sub="a night">
            <Stepper label="Sleep target" text={`${v.sleepHours}h`} onStep={(d) => bump('sleepHours', SLEEP, d)} low={v.sleepHours <= SLEEP.lo} high={v.sleepHours >= SLEEP.hi} />
          </Row>
          <Row lead={<ArtLead name="walk" />} label="Steps" sub="a day">
            <Stepper label="Steps target" text={nfIN.format(v.steps)} onStep={(d) => bump('steps', STEPS_RANGE, d)} low={v.steps <= STEPS_RANGE.lo} high={v.steps >= STEPS_RANGE.hi} />
          </Row>
          {v.areas.includes('health') ? (
            <Row lead={<ArtLead name="water" />} label="Water" sub="a day">
              <Stepper label="Water target" text={litres(v.waterMl)} onStep={(d) => bump('waterMl', WATER, d)} low={v.waterMl <= WATER.lo} high={v.waterMl >= WATER.hi} />
            </Row>
          ) : null}
        </div>
      </Group>
    </>
  )
}

// ── 3 · Focus ───────────────────────────────────────────────────────────────────────────────────────
function StepFocus({ v, set, picks, options, onRefuse }: { v: V; set: Set; picks: string[]; options: typeof IMPROVE; onRefuse: () => void }) {
  const focus = v.focus && v.areas.includes(v.focus) ? v.focus : v.areas[0]
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
      <Title step={2} title="What do you want to level up?" body="Pick your areas, then what The System should train first. It sets daily quests from these." />
      <Group label="Areas" hint="Each gets a page with its own numbers and trends.">
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {AREAS.map((c) => {
            const on = v.areas.includes(c)
            const Icon = AREA_ICON[c]
            return (
              <li key={c}>
                {/* Concentric: radius 16 tile, 8px padding, radius 8 icon chip. */}
                <button type="button" role="checkbox" aria-checked={on} onClick={() => toggleArea(c)}
                  className={cn('flex h-12 w-full items-center gap-2.5 rounded-[16px] ps-2 pe-2.5 text-start', choice, on ? PICKED : IDLE)}>
                  <IconChip color={CATEGORY[c].color} className={cn('transition-[filter,opacity] duration-150 ease-out-quint', !on && 'opacity-55 grayscale')}>
                    <Icon strokeWidth={2} />
                  </IconChip>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">{CATEGORY[c].label}</span>
                  <Tick on={on} />
                </button>
              </li>
            )
          })}
        </ul>
      </Group>

      {v.areas.length > 1 ? (
        <Group label="Which comes first?" hint="Quests and suggestions lean toward it.">
          <div role="radiogroup" aria-label="First area" className="flex flex-wrap gap-2">
            {v.areas.map((c) => {
              const on = c === focus
              return (
                // A 36px capsule with a 40px hit area.
                <button key={c} type="button" role="radio" aria-checked={on} onClick={() => set('focus', c)}
                  className={cn('relative inline-flex h-9 items-center gap-1.5 rounded-full ps-2.5 pe-3 text-[13px] font-medium text-ink after:absolute after:inset-[-2px]', choice, on ? PICKED : IDLE)}>
                  <span aria-hidden className="relative grid size-4 place-items-center">
                    <AnimatePresence initial={false} mode="popLayout">
                      {on ? (
                        <motion.span key="star" {...SWAP} className="grid place-items-center"><Star className="size-4 fill-[var(--medal-gold)] text-[var(--medal-gold)]" strokeWidth={2} /></motion.span>
                      ) : (
                        <motion.span key="dot" {...SWAP} className="size-2.5 rounded-full" style={{ background: CATEGORY[c].color }} />
                      )}
                    </AnimatePresence>
                  </span>
                  {CATEGORY[c].label}
                </button>
              )
            })}
          </div>
        </Group>
      ) : null}

      <Group label="Train first" hint={`Up to ${MAX_IMPROVE}, in priority order. Skip it and The System trains whatever is slipping most.`}>
        {options.length ? (
          <ul className="flex flex-wrap gap-2">
            {options.map((o) => {
              const rank = picks.indexOf(o.id) + 1
              const on = rank > 0
              return (
                <li key={o.id}>
                  {/* A 36px capsule with a 40px hit area. */}
                  <button type="button" role="checkbox" aria-checked={on} onClick={() => toggleTrain(o.id)}
                    className={cn('relative inline-flex h-9 items-center gap-1.5 rounded-full ps-2 pe-3 text-[13px] font-medium text-ink after:absolute after:inset-[-2px]', choice, on ? PICKED : IDLE, !on && full && 'opacity-50')}>
                    {/* Picked: its picture swaps for its priority number. */}
                    <span aria-hidden className="relative grid size-5 shrink-0 place-items-center">
                      <AnimatePresence initial={false} mode="popLayout">
                        {on ? (
                          <motion.span key="rank" {...SWAP} className="absolute inset-0 grid place-items-center rounded-full bg-pill text-[11px] leading-none font-bold text-white tabular-nums">{rank}</motion.span>
                        ) : (
                          <motion.span key="art" {...SWAP} className="grid place-items-center"><Art name={o.art} /></motion.span>
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
          <p className="rounded-md bg-surface-2 p-3 text-[13px] leading-normal text-ink-2">
            Nothing to pick for these areas yet. The System will learn from what you log and pick for you.
          </p>
        )}
      </Group>
    </>
  )
}

// ── 4 · Voice ───────────────────────────────────────────────────────────────────────────────────────
function StepVoice({ v, set }: { v: V; set: Set }) {
  const id = useId()
  const tone = TONES.find((t) => t.key === v.tone) ?? TONES[1]
  const add = (g: string) => set('goals', v.goals.trim() ? `${v.goals.trim().replace(/[.,]?$/, ',')} ${g.toLowerCase()}` : g)
  return (
    <>
      <Title step={3} title="How should ReLife coach you?" body="Pick a tone and say what you’re working toward. Your routines and every plan are built from this." />
      <Group label="Tone" hint="For nudges, weekly reviews and plans.">
        <Segmented label="Tone" options={TONES} value={v.tone} onChange={(k) => set('tone', k)} />
        {/* A nudge as it would land on your phone. Concentric: radius 16 card, 10px padding, radius 6 icon. */}
        <div className="mt-3 flex items-start gap-2.5 rounded-[16px] bg-surface p-2.5 pe-3 shadow-1" aria-live="polite">
          <CapsuleMark className="size-8 shrink-0 rounded-[6px]" />
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline justify-between gap-3 text-[12px] leading-4"><span className="font-semibold text-ink">ReLife</span><span className="text-ink-3">now</span></p>
            {/* Two lines kept, so a shorter message doesn't move what's below. */}
            <div className="relative mt-0.5 min-h-9">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.p key={tone.key} className="text-[13px] leading-[18px] text-pretty text-ink-2"
                  initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.3, ease: EASE_OUT_STRONG } }}
                  exit={{ opacity: 0, y: -4, filter: 'blur(4px)', transition: { duration: 0.12, ease: EASE_OUT } }}>
                  {tone.example}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </Group>
      <Group label="Goals" hint="In your own words. Honest beats polished.">
        <Textarea id={`${id}-g`} aria-label="Goals" value={v.goals} onChange={(e) => set('goals', e.target.value)} rows={3} maxLength={2000} placeholder="Sleep 7.5 hours, ship one side project a month…" className="resize-none text-[16px] leading-normal sm:text-[14px]" />
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Ideas">
          {GOAL_IDEAS.filter((g) => !v.goals.toLowerCase().includes(g.toLowerCase())).slice(0, 3).map((g) => (
            // A 32px capsule with a 40px hit area.
            <button key={g} type="button" onClick={() => add(g)} className={cn('relative inline-flex h-8 items-center gap-1 rounded-full px-3 text-[12px] font-medium text-ink-2 after:absolute after:-inset-y-1 after:inset-x-0 hover:text-ink', IDLE, choice)}>
              <Plus aria-hidden className="size-3 text-ink-3" strokeWidth={2} />{g}
            </button>
          ))}
        </div>
      </Group>
      <Group label="Anything plans should work around?" hint="Optional.">
        <Input aria-label="Anything plans should work around?" value={v.constraints} onChange={(e) => set('constraints', e.target.value)} maxLength={2000} placeholder="Vegetarian, office 10 to 7…" className={CONTROL} />
      </Group>
    </>
  )
}

// ── 5 · Routines ────────────────────────────────────────────────────────────────────────────────────
const PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic', model: 'claude-sonnet-5-5', key: 'ANTHROPIC_API_KEY', keyHint: 'sk-ant-…' },
  { id: 'openai', name: 'OpenAI', model: '', key: 'OPENAI_API_KEY', keyHint: 'sk-…' },
  { id: 'google', name: 'Gemini', model: '', key: 'GOOGLE_GENERATIVE_AI_API_KEY', keyHint: 'From Google AI Studio' },
  { id: 'openrouter', name: 'OpenRouter', model: '', key: 'OPENROUTER_API_KEY', keyHint: 'sk-or-…' },
] as const
const MODES = [
  { key: 'starter', label: 'Starter list' },
  { key: 'ai', label: <><Sparkles aria-hidden className="size-3.5" strokeWidth={1.5} />Build with AI</> },
] as const

/** What the AI is told: everything said so far, then anything added on this step. */
const brief = (v: V) => [
  `I wake up around ${v.wake} and go to bed around ${v.sleep}.`,
  v.improve.length ? `I most want to: ${v.improve.map((id) => IMPROVE.find((o) => o.id === id)?.label.toLowerCase()).filter(Boolean).join(', ')}.` : '',
  v.constraints.trim() ? `Work around: ${v.constraints.trim()}.` : '',
  v.prompt.trim(),
].filter(Boolean).join(' ').slice(0, 1500)

/** One routine in a list: its picture, its name, one line under it, and a tick. Concentric: radius 16 row, 8px padding, radius 8 picture tile. */
function RoutineRow({ t, sub, on, have, onToggle }: { t: Template; sub: string; on: boolean; have?: boolean; onToggle: () => void }) {
  return (
    <li>
      {/* One you already have lies flat: nothing to press. */}
      <button type="button" role="checkbox" aria-checked={on || !!have} disabled={have} onClick={onToggle} title={`${t.name} · ${sub}`}
        className={cn('flex h-14 w-full items-center gap-3 rounded-[16px] ps-2 pe-3 text-start disabled:cursor-default', choice, have ? 'bg-surface-2/60' : on ? PICKED : IDLE)}>
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[10px]" style={{ background: `color-mix(in oklch, ${CATEGORY[t.area].color} 14%, transparent)` }}>
          <RoutineArt name={t.name} kind={t.kind} area={t.area} className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-[14px] leading-5 font-medium', have ? 'text-ink-2' : 'text-ink')}>{t.name}</span>
          <span className="block truncate text-[12px] leading-4 text-ink-3">{have ? 'Already added' : sub}</span>
        </span>
        {have ? <Check className="me-0.5 size-4 shrink-0 text-ink-3" strokeWidth={2} aria-hidden /> : <Tick on={on} />}
      </button>
    </li>
  )
}

/**
 * The last step gives something back: a starter list grouped by area, or routines an AI builds from the
 * day, goals and training picks already given. Two tabs; each keeps its own ticks.
 */
function StepRoutines({ v, set, mode, starters, existing, today, ai, onAi }: {
  v: V; set: Set; mode: 'ai' | 'starter'; starters: Template[]; existing: string[]; today: string; ai: Ai | null; onAi: (a: Ai) => void
}) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const toggle = (id: string) => set('templates', v.templates.includes(id) ? v.templates.filter((x) => x !== id) : [...v.templates, id])
  const when = (t: Template) => `${describe(buildRRule({ ...t.rule, start: today }))}${t.note ? ` · ${t.note}` : ''}${t.dose ? ` · ${t.dose}` : ''}`
  // Suggested ones first in each area, so the best picks sit on top.
  const suggested = starters.filter((t) => t.suggested && !existing.includes(t.name.toLowerCase())).map((t) => t.id)

  const build = () => start(async () => {
    setErr(null); setEditing(false)
    const r = await suggestOnboardingRoutines({ prompt: brief(v), areas: v.areas, focus: v.focus, goals: v.goals })
    if (!r.ok) { setErr(r.error); setEditing(true); if (r.noModel) onAi({ ready: false, model: null }); return }
    set('generated', r.routines)
    set('templates', [...v.templates.filter((id) => !id.startsWith('ai-')), ...r.routines.map((x) => x.id)])
  })
  const results = v.generated.length > 0 && !editing
  const starterOn = v.templates.filter((id) => !id.startsWith('ai-'))

  return (
    <>
      <Title step={4} title="Start with a few routines" body="Each one gets a reminder and a streak, and lands on Today’s quest log. Change the times later." />
      <motion.div variants={item} className="flex items-center gap-3">
        <div className="flex-1"><Segmented label="Where routines come from" options={MODES} value={mode} onChange={(k) => set('routineMode', k)} /></div>
      </motion.div>
      <motion.div variants={item} className="mt-5" aria-busy={pending}>
        {mode === 'starter' ? (
          <>
            {suggested.length && !starterOn.length ? (
              <p className="mb-4 flex justify-end"><button type="button" onClick={() => set('templates', [...v.templates, ...suggested])} className={LINK}>Pick the suggested {suggested.length}</button></p>
            ) : null}
            <div className="flex flex-col gap-6">
              {v.areas.map((c) => {
                const list = starters.filter((t) => t.area === c).sort((a, b) => Number(!!b.suggested) - Number(!!a.suggested))
                if (!list.length) return null
                return (
                  <div key={c}>
                    <h2 className="mb-2 flex items-center gap-2 font-mono text-[11px] leading-4 font-semibold tracking-[0.14em] text-ink-3 uppercase">
                      <span aria-hidden className="h-3 w-1.5 rounded-full" style={{ background: CATEGORY[c].color }} />{CATEGORY[c].label}
                    </h2>
                    <ul className="flex flex-col gap-1.5">
                      {list.map((t) => <RoutineRow key={t.id} t={t} sub={when(t)} have={existing.includes(t.name.toLowerCase())} on={v.templates.includes(t.id)} onToggle={() => toggle(t.id)} />)}
                    </ul>
                  </div>
                )
              })}
            </div>
          </>
        ) : !ai ? (
          <div className="h-10 animate-pulse rounded-md bg-surface-2" />
        ) : !ai.ready ? (
          <ConnectModel onReady={() => aiReady().then(onAi)} />
        ) : pending ? (
          <div className="flex flex-col gap-1.5" role="status" aria-label="Building your routines">
            {[0, 1, 2, 3].map((k) => <div key={k} className="h-14 animate-pulse rounded-[16px] bg-surface-2" style={{ animationDelay: `${k * 100}ms` }} />)}
          </div>
        ) : results ? (
          <>
            <ul className="flex flex-col gap-1.5">
              {v.generated.map((g) => <RoutineRow key={g.id} t={g} sub={g.why} on={v.templates.includes(g.id)} onToggle={() => toggle(g.id)} />)}
            </ul>
            <p className="mt-3 flex justify-center"><button type="button" onClick={() => setEditing(true)} className={LINK}>Add detail and build again</button></p>
          </>
        ) : (
          <>
            <Field label="Anything else worth knowing? (optional)" htmlFor="routine-prompt" hint={`Built from your answers with ${ai.model?.split(':')[1] ?? 'your model'}.`}>
              <Textarea id="routine-prompt" value={v.prompt} onChange={(e) => set('prompt', e.target.value)} rows={2} maxLength={1000}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); build() } }}
                placeholder="Office 10 to 7, gym three times a week…" className="min-h-0 resize-none text-[16px] leading-normal sm:text-[14px]" />
            </Field>
            <Button variant="accent" size="lg" onClick={build} className="mt-3 h-10 w-full text-[14px]">
              <Sparkles className="size-4" strokeWidth={2} />{v.generated.length ? 'Build again' : 'Build my routines'}
            </Button>
            {v.generated.length ? <p className="mt-3 flex justify-center"><button type="button" onClick={() => setEditing(false)} className={LINK}>Back to routines</button></p> : null}
            {err ? <p role="alert" className="mt-2 text-center text-[12px] leading-[18px] font-medium text-bad">{err}</p> : null}
          </>
        )}
      </motion.div>
    </>
  )
}

/** Connect an AI provider without leaving setup: pick one, paste a key, done. */
function ConnectModel({ onReady }: { onReady: () => void }) {
  const [p, setP] = useState<(typeof PROVIDERS)[number]>(PROVIDERS[0])
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const form = useRef<HTMLFormElement>(null)
  const submit = () => start(async () => {
    setErr(null)
    const r = await connectIntegration(p.id, null, new FormData(form.current!))
    if (r && !r.ok) return setErr(r.error ?? 'Could not connect. Check the key.')
    onReady()
  })
  return (
    <form
      ref={form}
      onSubmit={(e) => { e.preventDefault(); submit() }}
      // Enter here connects; it must not trigger setup's Continue.
      onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') { e.preventDefault(); submit() } }}
      className="flex flex-col gap-3 rounded-[16px] bg-surface p-4 shadow-1"
    >
      <p className="text-[13px] leading-[18px] text-ink-2">Connect a model and it builds routines from your answers. Or use the starter list.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Provider" htmlFor="ai-provider">
          <Select id="ai-provider" value={p.id} onChange={(e) => setP(PROVIDERS.find((x) => x.id === e.target.value) ?? PROVIDERS[0])} className={CONTROL}>
            {PROVIDERS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </Field>
        <Field label="Model" htmlFor="ai-model">
          <Input key={p.id} id="ai-model" name="LLM_DEFAULT" defaultValue={p.model} spellCheck={false} placeholder="Model name" className={CONTROL} />
        </Field>
      </div>
      <Field label="API key" htmlFor="ai-key" hint="Encrypted on this Mac and only sent to the provider.">
        <Input key={p.id} id="ai-key" name={p.key} type="password" autoComplete="off" spellCheck={false} placeholder={p.keyHint} className={CONTROL} />
      </Field>
      <Button type="submit" variant="secondary" size="lg" disabled={pending} className="h-10 w-full text-[14px]">{pending ? 'Connecting…' : `Connect ${p.name}`}</Button>
      {err ? <p role="alert" className="text-center text-[12px] leading-[18px] font-medium text-bad">{err}</p> : null}
    </form>
  )
}

// ── Done ────────────────────────────────────────────────────────────────────────────────────────────
const NEXT = [
  { title: 'A one-minute tour', body: 'Where quests, ⌘K logging and your progress live.' },
  { title: 'Finish setting up on Today', body: 'Connect your apps and phone so they log for you.' },
]

function Done({ name, level }: { name: string; level: Level }) {
  const pct = Math.round(level.progress * 100)
  return (
    <>
      <div className="mb-8">
        <motion.p variants={item} className="inline-flex items-center gap-1.5 font-mono text-[11px] leading-4 font-semibold tracking-[0.14em] text-good uppercase">
          <Check className="size-3.5" strokeWidth={2.5} aria-hidden />Save file created
        </motion.p>
        <motion.h1 variants={item} className="mt-2 font-display text-[32px] leading-[1.1] font-extrabold tracking-[-0.025em] text-balance text-ink sm:text-[40px]">
          You’re in{name ? `, ${name}` : ''}.
        </motion.h1>
        <motion.p variants={item} className="mt-2 max-w-[420px] text-[15px] leading-normal text-pretty text-ink-2">Check things off and hit your targets to earn XP. Every level is yours to keep.</motion.p>
      </div>
      <motion.div variants={item} className="rounded-[20px] bg-surface p-5 shadow-1">
        <p className="flex items-center justify-between gap-3 text-[13px] leading-6">
          <span className="flex min-w-0 items-center gap-2">
            <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-ink px-2 text-[12px] font-bold text-bg tabular-nums">Lv {level.level}</span>
            <span className="truncate font-semibold text-ink">{level.title}</span>
          </span>
          <span className="shrink-0 text-ink-3 tabular-nums">{pct}% to Level {level.level + 1}</span>
        </p>
        <div role="img" aria-label={`Level ${level.level}, ${pct}% of the way to level ${level.level + 1}`} className="mt-2.5 h-2 overflow-hidden rounded-full bg-surface-2 shadow-[inset_0_0_0_1px_var(--hairline)]">
          {/* Slides instead of scaling, so the round end stays round. A sliver shows even at zero. */}
          <motion.div className="h-full rounded-full bg-pill" initial={{ x: '-100%' }} animate={{ x: `${(Math.max(0.04, level.progress) - 1) * 100}%` }} transition={{ duration: 0.9, ease: EASE_OUT_STRONG, delay: 0.4 }} />
        </div>
      </motion.div>
      <motion.div variants={item} className="mt-8">
        <h2 className="text-[13px] leading-5 font-semibold text-ink">Up next</h2>
        <ol className="mt-3 flex flex-col">
          {NEXT.map((n, k) => (
            <li key={n.title} className="flex items-start gap-3 border-divider py-3 not-first:border-t">
              <span aria-hidden className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-[12px] font-semibold text-ink-2 tabular-nums">{k + 1}</span>
              <span className="min-w-0">
                <span className="block text-[14px] leading-5 font-medium text-ink">{n.title}</span>
                <span className="block text-[12.5px] leading-[18px] text-ink-3">{n.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </motion.div>
    </>
  )
}

// Country → currency for the picker's "suggested" row. Euro countries share EUR.
const EURO = ['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK']
const REGION_CURRENCY: Record<string, string> = {
  IN: 'INR', US: 'USD', GB: 'GBP', JP: 'JPY', SG: 'SGD', AE: 'AED', CA: 'CAD', AU: 'AUD', NZ: 'NZD', CH: 'CHF',
  CN: 'CNY', HK: 'HKD', KR: 'KRW', BR: 'BRL', MX: 'MXN', ZA: 'ZAR', SA: 'SAR', ID: 'IDR', MY: 'MYR', TH: 'THB',
  PH: 'PHP', VN: 'VND', NG: 'NGN', KE: 'KES', PK: 'PKR', BD: 'BDT', LK: 'LKR', NP: 'NPR', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', TR: 'TRY',
  ...Object.fromEntries(EURO.map((c) => [c, 'EUR'])),
}
