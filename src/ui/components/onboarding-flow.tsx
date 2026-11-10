'use client'

import { AnimatePresence, motion, type Variants } from 'motion/react'
import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { ArrowLeft, ArrowRight, Check, LoaderCircle, Minus, Moon, Plus, Sparkles, Sun, type LucideIcon } from 'lucide-react'
import type { Category } from '@/db/schema'
import type { Template } from '@/core/onboarding'
import type { SuggestedRoutine } from '@/ai/routines'
import { buildRRule, describe } from '@/domain/recurrence'
import { aiReady, connectIntegration, finishOnboarding, skipOnboardingAction, suggestOnboardingRoutines } from '@/app/actions'
import { CATEGORY } from '../tokens'
import { Button, buttonClass } from './button'
import { Field, Input, Select, Textarea } from './form'
import { CurrencyPicker, TimezonePicker } from './region-picker'
import { CapsuleMark, Wordmark } from './logo'
import { AREA_ICON, CapsuleIcon } from './capsule-icon'
import { IconChip } from './card'
import { RoutineArt } from './routine-art'
import { cn } from '../cn'
import { EASE_OUT, EASE_OUT_STRONG, SPRING_LAYOUT } from '@/ui/beui/lib/ease'
import { DigitSwap } from '@/ui/beui/motion/digit-swap'

// One-time setup: a small card in the middle of the screen (400px, like a sign-in card) with the
// player's capsule on its top edge, and one short question on it at a time. Eight questions, each
// sized to the card: a field, a few rows with − / + beside them, a handful of tiles or capsules, or a
// short list that scrolls inside. Every one comes filled in, so Enter walks straight through.
// The order matters: goals come before routines, so the AI builds routines from everything said so far.
// The card uses the app's own controls (Field, Input, Select, Button, IconChip) at their usual sizes.
// Behind it, the backdrop is the game itself: a halftone skyline of XP bars that grows with every step,
// and small capsules in the colours of the picked areas drifting up from it.

const SPRING = { type: 'spring', duration: 0.3, bounce: 0 } as const
// Icon swaps: scale 0.25→1, opacity 0→1, blur 4px→0.
const SWAP = { initial: { scale: 0.25, opacity: 0, filter: 'blur(4px)' }, animate: { scale: 1, opacity: 1, filter: 'blur(0px)' }, exit: { scale: 0.25, opacity: 0, filter: 'blur(4px)' }, transition: SPRING }

// Seen once, so it can afford a little delight: a step slides the way you're going and its heading
// and answers arrive one after another. Choices themselves respond at once (≤150ms).
const stepMotion: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 16 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.3, ease: EASE_OUT_STRONG, staggerChildren: 0.05, delayChildren: 0.02 } },
  // Exits are softer than enters: shorter distance, quicker.
  exit: (dir: number) => ({ opacity: 0, x: dir * -8, filter: 'blur(2px)', transition: { duration: 0.15, ease: EASE_OUT } }),
}
const item: Variants = {
  enter: { opacity: 0, y: 8, filter: 'blur(4px)' },
  center: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.4, ease: EASE_OUT_STRONG } },
  exit: {},
}

const AREAS = Object.keys(CATEGORY) as Category[]
const TONES = [
  { key: 'gentle', label: 'Gentle', example: 'Nice work on sleep this week. Try lights out 15 minutes earlier?' },
  { key: 'balanced', label: 'Balanced', example: 'Sleep is up, spending too. One change: cook twice this week.' },
  { key: 'blunt', label: 'Blunt', example: 'Food delivery is 32% over. Delete Zomato for two weeks.' },
] as const
type Tone = (typeof TONES)[number]['key']
const GOAL_IDEAS = ['Sleep 7.5 hours', 'Ship a side project', 'Save 30% of income', 'Read 12 books this year', 'Call family every week', 'Exercise 3 times a week']

type Initial = {
  name: string; timezone: string; baseCurrency: string; areas: Category[]; focus?: Category
  /** Stats The System trains first, in priority order. */
  improve: string[]
  /** Usual wake and bed times, "HH:MM". */
  wake: string; sleep: string
  sleepHours: number; steps: number; waterMl: number
  tone: Tone; goals: string; constraints: string
}
type V = Initial & {
  templates: string[]; generated: SuggestedRoutine[]; prompt: string
  /** Which routine list is showing. Not chosen yet: AI when a model is connected, else the starter list. */
  routineMode: 'ai' | 'starter' | null
  sleepTouched: boolean
}
type Ai = { ready: boolean; model: string | null }
type Level = { level: number; title: string; progress: number }
type Set = <K extends keyof V>(k: K, val: V[K]) => void

// Browsers list some zones under old names (Asia/Calcutta), so compare and accept by what Intl resolves.
const canonTz = (tz: string) => { try { return new Intl.DateTimeFormat('en', { timeZone: tz }).resolvedOptions().timeZone } catch { return null } }
const city = (tz: string) => tz.split('/').pop()!.replaceAll('_', ' ')
const firstName = (name: string) => name.trim().split(' ')[0]

const STEPS = ['You', 'Your day', 'Areas', 'Training', 'Targets', 'Tone', 'Goals', 'Routines'] as const
const LAST = STEPS.length - 1

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill'
// A pickable thing looks like the app's secondary button until picked, then takes a capsule-blue wash
// and ring. Area colours stay in the icons.
const choice = cn('transition-[background-color,box-shadow,scale,opacity] duration-150 ease-out-quint active:scale-[0.96]', FOCUS)
const IDLE = 'bg-surface shadow-1 hover:bg-surface-2'
const PICKED = 'bg-pill-wash shadow-[0_0_0_1.5px_var(--pill)]'
// Text controls at the card's 40px height. 16px text on a phone: iOS zooms the page on anything smaller.
const CONTROL = 'h-10 text-[16px] sm:text-[14px]'
// The region pickers, at the same height and look as the name field.
const PICKER = 'h-10 rounded-md bg-surface px-3 text-[16px] shadow-1 focus-visible:shadow-[0_0_0_2px_var(--pill)] aria-expanded:shadow-[0_0_0_2px_var(--pill)] sm:text-[14px]'
// A long list scrolls inside the card. The padding keeps rings clear of the edge and the last row clear
// of the fade; the height is what the screen has left around the rest of the card.
const SCROLL = 'scroll-fade -mx-1.5 -mt-2 max-h-[max(148px,min(268px,calc(100dvh_-_500px)))] overflow-y-auto overscroll-contain px-1.5 pt-2 pb-6'

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
  const [nudge, setNudge] = useState(0) // bumps when a fourth training pick is refused, to shake the count
  const [pending, start] = useTransition()
  const [result, setResult] = useState<Level | null>(null)
  const done = !!result
  const go = useRef<HTMLAnchorElement>(null)
  const [ai, setAi] = useState<Ai | null>(null)
  useEffect(() => { aiReady().then(setAi) }, [])

  // This device knows its own time zone, so first setup starts from it. (Its currency would only be a
  // guess from the browser's language, so that is just suggested in the picker.) Read after mount, so
  // server and client render the same markup.
  const [device, setDevice] = useState<{ tz: string; cur: string | null } | null>(null)
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const region = new Intl.Locale(navigator.language).maximize().region
    setDevice({ tz, cur: region ? REGION_CURRENCY[region] ?? null : null })
    // Only when it really is another zone: browsers call Asia/Kolkata by its old name, Asia/Calcutta.
    if (fresh && canonTz(tz)) setV((s) => (canonTz(s.timezone) === canonTz(tz) ? s : { ...s, timezone: tz }))
  }, [fresh])

  const set: Set = (k, val) => { setV((s) => ({ ...s, [k]: val })); setError(null); setNudge(0) }
  const options = IMPROVE.filter((o) => v.areas.includes(o.area))
  const picks = v.improve.filter((id) => options.some((o) => o.id === id))
  const mode = v.routineMode ?? (ai?.ready ? 'ai' : 'starter')
  // Each routine list keeps its own ticks; only the list on screen is created.
  const routines = v.templates.filter((id) => (mode === 'ai') === id.startsWith('ai-'))

  const check = (): string | null => {
    if (i === 0 && !v.name.trim()) return 'Type your name to continue'
    if (i === 0 && !canonTz(v.timezone)) return 'Pick a time zone from the list'
    if (i === 0 && !currencies.includes(v.baseCurrency.toUpperCase())) return 'Pick a currency from the list'
    if (i === 2 && !v.areas.length) return 'Pick at least one area'
    return null
  }
  // The button looks unavailable until the step has its answer; pressing it anyway says what's missing.
  const ready = !check()
  const to = (k: number) => { setDir(k > i ? 1 : -1); setI(k); setError(null); setNudge(0) }
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
      setDir(1); setResult(r.level)
      window.dispatchEvent(new Event('relife:celebrate'))
    })
  }
  useEffect(() => { if (done) go.current?.focus() }, [done])

  // Enter continues, like any form, except in multi-line fields. (A focused button keeps Enter for
  // itself; the pickers stop it.) Finishing takes a click.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.shiftKey || e.defaultPrevented || done || pending || i === LAST) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'BUTTON' || tag === 'TEXTAREA') return
      e.preventDefault(); next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const letter = (firstName(v.name)[0] ?? '?').toUpperCase()
  // On the last step with the AI ready and nothing picked, building routines leads and finishing is the quiet choice.
  const quiet = i === LAST && mode === 'ai' && !!ai?.ready && !routines.length
  const inBed = nightHours(v.sleep, v.wake)
  // One line under the action: what's missing, a count, or a note.
  const refused = i === 3 && nudge > 0
  const line = error ?? (done ? 'Next on Today: connect your apps so they do the logging.'
    : i === 0 ? 'You can change all of this later in Settings.'
    : i === 1 ? (v.sleepHours <= inBed - 0.25 ? `${inBed}h in bed, so we’ll aim for ${v.sleepHours}h of sleep.` : `${inBed}h in bed is tight for ${v.sleepHours}h of sleep.`)
    : i === 2 ? 'Run setup again from Settings to change your areas.'
    : i === 3 ? (refused ? 'Up to three. Drop one to swap.' : `${picks.length} of ${MAX_IMPROVE} picked`)
    : i === 4 ? 'Change targets anytime in Habits.'
    : i === 5 ? 'Edit the wording anytime in Settings.'
    : i === 6 ? 'Honest beats polished.'
    : routines.length ? `${routines.length} picked` : 'None picked. Add routines anytime in Habits.')

  return (
    <div className="fixed inset-0 z-[60] bg-bg">
      <Backdrop progress={done ? 1 : i / LAST} areas={v.areas} />

      <div data-onboarding-scroll className="absolute inset-0 flex flex-col overflow-x-hidden overflow-y-auto">
        <header className="grid h-[72px] shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 pt-[env(safe-area-inset-top)] sm:px-8">
          <Wordmark className="h-6" />
          <Progress current={done ? STEPS.length : i} onJump={(k) => { if (!done && !pending && k < i) to(k) }} />
          {!done ? (
            <button
              type="button"
              onClick={() => start(async () => { await skipOnboardingAction(); window.location.assign('/') })}
              className={cn('col-start-3 -me-3 h-10 justify-self-end rounded-md px-3 text-[14px] font-medium text-ink-3 transition-[color,scale] duration-150 ease-out-quint hover:text-ink active:scale-[0.96]', FOCUS)}
            >
              Skip for now
            </button>
          ) : null}
        </header>

        {/* Bottom padding mirrors the top bar, so the card sits in the optical centre. Top padding leaves
            room for the half of the capsule that stands above the card. */}
        <div className="flex flex-1 items-center justify-center px-4 pt-10 pb-[72px] short:pb-6">
          <div className="rise relative w-full max-w-[400px] rounded-[24px] bg-surface shadow-2">
            {/* The player, standing on the card's top edge: half above, half inside. */}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-[30px] flex justify-center">
              <motion.span key={letter} className="inline-flex" initial={{ scale: 0.9 }} animate={{ scale: 1 }} transition={SPRING}>
                <CapsuleIcon letter={letter} size="md" />
              </motion.span>
            </div>

            {/* Back lives in one corner and the count in the other, so the bottom holds one action. */}
            <AnimatePresence initial={false}>
              {!done && i > 0 ? (
                <motion.div key="back" className="absolute top-3 left-3 z-20" {...SWAP}>
                  <Button variant="ghost" size="icon-sm" aria-label="Back" onClick={() => to(i - 1)} disabled={pending} className="rounded-full">
                    <ArrowLeft className="size-4 rtl:-scale-x-100" strokeWidth={2} />
                  </Button>
                </motion.div>
              ) : null}
            </AnimatePresence>
            {!done ? <p className="absolute top-5 right-5 text-[12px] leading-4 text-ink-3 tabular-nums"><span className="sr-only">Step </span>{i + 1} of {STEPS.length}</p> : null}

            <Fluid>
              {/* The old step fades out in place while the new one comes in and the card takes its
                  height, so the card is never left blank. 54px on top: half the capsule plus 24px. */}
              <div className="relative px-6 pt-[54px] sm:px-8">
                <AnimatePresence mode="popLayout" custom={dir} initial={false}>
                  <motion.section key={done ? 'done' : i} custom={dir} variants={stepMotion} initial="enter" animate="center" exit="exit" aria-live="polite">
                    {result ? <Done name={firstName(v.name)} level={result} />
                      : i === 0 ? <StepYou v={v} set={set} suggested={device} timezones={timezones} currencies={currencies} />
                      : i === 1 ? <StepDay v={v} set={set} />
                      : i === 2 ? <StepAreas v={v} set={set} />
                      : i === 3 ? <StepTraining picks={picks} options={options} set={set} onRefuse={() => setNudge((n) => n + 1)} />
                      : i === 4 ? <StepTargets v={v} set={set} />
                      : i === 5 ? <StepTone v={v} set={set} />
                      : i === 6 ? <StepGoals v={v} set={set} />
                      : <StepRoutines v={v} set={set} mode={mode} templates={templates} existing={existing} today={today} ai={ai} onAi={setAi} />}
                  </motion.section>
                </AnimatePresence>
              </div>

              {/* The one action, in the same place on every screen, with one quiet line under it. */}
              <div className="px-6 pt-6 pb-6 sm:px-8 sm:pb-7">
                {done ? (
                  <a ref={go} href="/?tour" className={buttonClass({ variant: 'primary', size: 'lg', className: 'h-10 w-full text-[14px]' })}>
                    Go to Today<ArrowRight className="size-4 rtl:-scale-x-100" strokeWidth={2} />
                  </a>
                ) : (
                  <Button variant={quiet ? 'secondary' : 'primary'} size="lg" onClick={next} disabled={pending} aria-disabled={!ready} aria-busy={pending}
                    className="h-10 w-full text-[14px] aria-disabled:opacity-50">
                    {pending ? <><LoaderCircle className="size-4 animate-spin [animation-duration:0.7s]" aria-hidden />Creating your save…</>
                      : <>{i < LAST ? 'Continue' : 'Create my save'}<ArrowRight className="size-4 rtl:-scale-x-100" strokeWidth={2} /></>}
                  </Button>
                )}
                {/* Its height is kept, so nothing moves when the line changes. A refused pick shakes it once. */}
                <motion.p key={nudge} role={error ? 'alert' : undefined} aria-live="polite"
                  initial={false} animate={refused ? { x: [0, -5, 5, -3, 3, 0] } : { x: 0 }} transition={{ duration: 0.3, ease: EASE_OUT }}
                  className={cn('mt-3 min-h-[18px] text-center text-[12px] leading-[18px] text-pretty tabular-nums', error || refused ? 'font-medium text-bad' : 'text-ink-3')}>
                  {line}
                </motion.p>
              </div>
            </Fluid>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * The card hugs its content and glides to each new height. It clips only while it moves; at rest the
 * pickers' lists can hang outside it.
 */
function Fluid({ children }: { children: React.ReactNode }) {
  const inner = useRef<HTMLDivElement>(null)
  const last = useRef<number | null>(null)
  const [height, setHeight] = useState<number>()
  const [moving, setMoving] = useState(false)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const ro = new ResizeObserver(([e]) => {
      const h = Math.round(e.borderBoxSize[0].blockSize)
      if (last.current !== null && last.current !== h) { setMoving(true); clearTimeout(t); t = setTimeout(() => setMoving(false), 350) }
      last.current = h
      setHeight(h)
    })
    ro.observe(inner.current!)
    return () => { ro.disconnect(); clearTimeout(t) }
  }, [])
  return (
    <div style={{ height }} className={cn('rounded-[inherit] transition-[height] duration-300 ease-[var(--ease-out-strong)] motion-reduce:transition-none', moving && 'overflow-hidden')}>
      <div ref={inner}>{children}</div>
    </div>
  )
}

/** The question, centred under the capsule: a title and one line of help, each on its own beat. */
function Title({ title, body }: { title: string; body: string }) {
  return (
    <div className="mb-6 text-center">
      <motion.h1 variants={item} className="font-display text-[24px] leading-[1.2] font-extrabold tracking-[-0.02em] text-balance text-ink">{title}</motion.h1>
      <motion.p variants={item} className="mx-auto mt-2 max-w-[320px] text-[14px] leading-normal text-balance text-ink-2">{body}</motion.p>
    </div>
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
  const btn = cn('grid h-10 w-9 place-items-center text-ink-2 transition-[color,background-color,scale,opacity] duration-150 ease-out-quint hover:bg-surface-2 hover:text-ink active:scale-[0.96] disabled:pointer-events-none disabled:opacity-35', FOCUS)
  return (
    <span role="group" aria-label={label} className="inline-flex h-10 shrink-0 items-center rounded-md bg-surface shadow-1">
      <button type="button" aria-label={`${label}, less`} disabled={low} onClick={() => step(-1)} className={cn(btn, 'rounded-s-md')}><Minus className="size-4" strokeWidth={2} /></button>
      <output aria-live="polite" aria-label={`${label} ${text}`} className="flex w-[68px] justify-center text-[14px] font-semibold text-ink tabular-nums">
        <DigitSwap value={text} direction={dir} />
      </output>
      <button type="button" aria-label={`${label}, more`} disabled={high} onClick={() => step(1)} className={cn(btn, 'rounded-e-md')}><Plus className="size-4" strokeWidth={2} /></button>
    </span>
  )
}

/** One line of a short list: what it is on the left, its control on the right. Lines are divided by hairlines. */
function Row({ lead, label, sub, children }: { lead: React.ReactNode; label: string; sub?: string; children: React.ReactNode }) {
  return (
    <motion.div variants={item} className="flex h-14 items-center justify-between gap-3 border-divider not-first:border-t">
      <span className="flex min-w-0 items-center gap-2.5">
        {lead}
        <span className="min-w-0">
          <span className="block truncate text-[14px] leading-5 font-medium text-ink">{label}</span>
          {sub ? <span className="block truncate text-[12px] leading-4 text-ink-3">{sub}</span> : null}
        </span>
      </span>
      {children}
    </motion.div>
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

// ── You ─────────────────────────────────────────────────────────────────────────────────────────────
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
      <Title title="Welcome to ReLife" body="Name your save file to begin. Setup takes about two minutes." />
      <motion.div variants={item}>
        <Field label="Your name" htmlFor={`${id}-n`}>
          <Input id={`${id}-n`} value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="First name" autoComplete="given-name" maxLength={60} autoFocus className={CONTROL} />
        </Field>
      </motion.div>
      {/* Above the button that follows (each block is its own layer once it has animated in), so an
          open list covers the button instead of sliding under it. */}
      <motion.div variants={item} className="relative z-20 mt-4">
        {open ? (
          <div className="grid grid-cols-[minmax(0,1fr)_108px] gap-3">
            <Field label="Time zone" htmlFor={`${id}-tz`}>
              <TimezonePicker id={`${id}-tz`} value={v.timezone} onChange={(z) => set('timezone', z)} options={timezones} suggested={[deviceTz]} triggerClassName={PICKER} />
            </Field>
            <Field label="Currency" htmlFor={`${id}-cur`}>
              <CurrencyPicker id={`${id}-cur`} value={v.baseCurrency} onChange={(c) => set('baseCurrency', c)} options={currencies} suggested={[suggested?.cur]} triggerClassName={PICKER} />
            </Field>
          </div>
        ) : (
          <p className="flex items-center justify-between gap-3 text-[13px] leading-5 text-ink-3">
            <span className="min-w-0 truncate">{city(v.timezone)} time · {v.baseCurrency.toUpperCase()}</span>
            {/* A text link with a 40px hit area. */}
            <button type="button" onClick={() => setOpen(true)}
              className={cn('relative shrink-0 rounded-sm font-medium text-ink underline decoration-ink/25 underline-offset-[3px] transition-[text-decoration-color] duration-150 ease-out-quint after:absolute after:-inset-x-2 after:-inset-y-2.5 hover:decoration-ink', FOCUS)}>
              Change
            </button>
          </p>
        )}
      </motion.div>
    </>
  )
}

// ── Your day ────────────────────────────────────────────────────────────────────────────────────────
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const fromMin = (m: number) => { const x = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}` }
/** Hours from bedtime to waking, across midnight. */
const nightHours = (sleep: string, wake: string) => ((toMin(wake) - toMin(sleep) + 1440) % 1440) / 60
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
/** A sleep target that fits the night: time in bed less half an hour to fall asleep, to the half hour. */
const fitSleep = (night: number) => clamp(Math.round((night - 0.5) * 2) / 2, 5, 10)

/**
 * Noon to noon, so a normal night is one block. The night block and the sun and moon glide with
 * clip-path and transform only.
 */
function DayBar({ wake, sleep }: { wake: string; sleep: string }) {
  const pos = (t: string) => ((toMin(t) - 720 + 1440) % 1440) / 1440
  const a = pos(sleep)
  const b = pos(wake)
  const segs: [number, number][] = a <= b ? [[a, b]] : [[a, 1], [0, b]]
  const len = (b - a + 1) % 1
  const moon = (a + len / 2) % 1
  const sun = (b + (1 - len) / 2) % 1
  const glide = 'transition-[transform] duration-300 ease-[var(--ease-out-strong)] motion-reduce:transition-none'
  return (
    <div aria-hidden>
      <div className="relative h-8 overflow-hidden rounded-[10px] shadow-[inset_0_0_0_1px_var(--hairline)]"
        style={{ background: 'linear-gradient(90deg, color-mix(in oklch, var(--sky) 40%, var(--surface)), color-mix(in oklch, var(--sky) 22%, var(--surface)))' }}>
        {[0, 1].map((k) => {
          const seg = segs[k]
          return (
            <div key={k} className="absolute inset-0 transition-[clip-path,opacity] duration-300 ease-[var(--ease-out-strong)] motion-reduce:transition-none"
              style={{ background: 'linear-gradient(90deg, var(--night), color-mix(in oklch, var(--night) 80%, var(--pill)))', opacity: seg ? 1 : 0,
                clipPath: seg ? `inset(0 ${(1 - seg[1]) * 100}% 0 ${seg[0] * 100}% round 9px)` : 'inset(0 50% 0 50% round 9px)' }} />
          )
        })}
        {/* Full-width layers, so translateX(%) moves by the bar's width. */}
        <div className={cn('absolute inset-0', glide)} style={{ transform: `translateX(${moon * 100}%)` }}>
          <Moon className="absolute top-1/2 left-0 size-3.5 -translate-x-1/2 -translate-y-1/2 text-white" strokeWidth={2} />
        </div>
        <div className={cn('absolute inset-0', glide)} style={{ transform: `translateX(${sun * 100}%)` }}>
          <Sun className="absolute top-1/2 left-0 size-3.5 -translate-x-1/2 -translate-y-1/2 text-[color-mix(in_oklch,var(--medal-gold)_80%,var(--ink))]" strokeWidth={2} />
        </div>
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] leading-4 text-ink-3 tabular-nums"><span>12 pm</span><span>6 pm</span><span>12 am</span><span>6 am</span><span>12 pm</span></div>
    </div>
  )
}

const Lead = ({ icon: Icon }: { icon: LucideIcon }) => <Icon aria-hidden className="size-4 shrink-0 text-ink-3" strokeWidth={1.5} />

function StepDay({ v, set }: { v: V; set: Set }) {
  const move = (k: 'wake' | 'sleep', d: number) => {
    const t = fromMin(toMin(v[k]) + d * 30)
    set(k, t)
    if (!v.sleepTouched) set('sleepHours', fitSleep(nightHours(k === 'sleep' ? t : v.sleep, k === 'wake' ? t : v.wake)))
  }
  return (
    <>
      <Title title="When does your day run?" body="Reminders stay quiet while you sleep, and your sleep target fits your night." />
      <div>
        <Row lead={<Lead icon={Sun} />} label="Wake up"><Stepper label="Wake up" text={v.wake} onStep={(d) => move('wake', d)} /></Row>
        <Row lead={<Lead icon={Moon} />} label="Bedtime"><Stepper label="Bedtime" text={v.sleep} onStep={(d) => move('sleep', d)} /></Row>
      </div>
      <motion.div variants={item} className="mt-3"><DayBar wake={v.wake} sleep={v.sleep} /></motion.div>
    </>
  )
}

// ── Areas ───────────────────────────────────────────────────────────────────────────────────────────
function StepAreas({ v, set }: { v: V; set: Set }) {
  const id = useId()
  const toggle = (c: Category) => {
    const next = AREAS.filter((x) => (x === c) !== v.areas.includes(x))
    set('areas', next)
    if (v.focus && !next.includes(v.focus)) set('focus', undefined)
  }
  return (
    <>
      <Title title="What do you want to work on?" body="Pick the areas you want to level up." />
      <ul className="grid grid-cols-2 gap-2">
        {AREAS.map((c) => {
          const on = v.areas.includes(c)
          const Icon = AREA_ICON[c]
          return (
            <motion.li key={c} variants={item}>
              {/* Concentric: radius 16 tile, 8px padding, radius 8 icon chip. */}
              <button type="button" role="checkbox" aria-checked={on} onClick={() => toggle(c)}
                className={cn('flex h-11 w-full items-center gap-2.5 rounded-[16px] ps-2 pe-2.5 text-start', choice, on ? PICKED : IDLE)}>
                <IconChip color={CATEGORY[c].color} className={cn('transition-[filter,opacity] duration-150 ease-out-quint', !on && 'opacity-55 grayscale')}>
                  <Icon strokeWidth={2} />
                </IconChip>
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">{CATEGORY[c].label}</span>
                <Tick on={on} />
              </button>
            </motion.li>
          )
        })}
      </ul>
      {v.areas.length > 1 ? (
        <motion.div variants={item} className="mt-4">
          <Field label="Which one comes first?" htmlFor={`${id}-f`} hint="Quests and suggestions lean toward it.">
            <Select id={`${id}-f`} value={v.focus ?? v.areas[0]} onChange={(e) => set('focus', e.target.value as Category)} className={CONTROL}>
              {v.areas.map((c) => <option key={c} value={c} data-color={CATEGORY[c].color}>{CATEGORY[c].label}</option>)}
            </Select>
          </Field>
        </motion.div>
      ) : null}
    </>
  )
}

// ── The System ──────────────────────────────────────────────────────────────────────────────────────
/** What The System can train, as signal ids from core/patterns. */
const IMPROVE: { id: string; area: Category; label: string; art: string }[] = [
  { id: 'tracker:sleep.hours', area: 'health', label: 'Sleep more', art: 'sleep' },
  { id: 'tracker:steps', area: 'health', label: 'Walk more', art: 'walk' },
  { id: 'tracker:drink-water', area: 'health', label: 'Drink more water', art: 'water' },
  { id: 'routines', area: 'mind', label: 'Stick to my routines', art: 'check' },
  { id: 'tracker:mood', area: 'mind', label: 'Feel better', art: 'mood' },
  { id: 'tracker:screen.social', area: 'mind', label: 'Less social media', art: 'phone' },
  { id: 'tracker:github.commits', area: 'skills', label: 'Ship more code', art: 'code' },
  { id: 'tracker:learning.minutes', area: 'skills', label: 'Learn more', art: 'read' },
  { id: 'tracker:screen.work', area: 'skills', label: 'More deep work', art: 'target' },
  { id: 'spend', area: 'wealth', label: 'Spend less', art: 'money' },
  { id: 'spend:apps', area: 'wealth', label: 'Order in less', art: 'delivery' },
  { id: 'orders:late', area: 'wealth', label: 'Fewer late-night orders', art: 'moon' },
]
const MAX_IMPROVE = 3

function StepTraining({ picks, options, set, onRefuse }: { picks: string[]; options: typeof IMPROVE; set: Set; onRefuse: () => void }) {
  const full = picks.length >= MAX_IMPROVE
  const toggle = (id: string) => {
    if (picks.includes(id)) return set('improve', picks.filter((x) => x !== id))
    if (full) return onRefuse()
    set('improve', [...picks, id])
  }
  return (
    <>
      <Title title="What should The System train first?" body="Pick up to three, in priority order. Skip this and it trains whatever is slipping most." />
      {options.length ? (
        <motion.ul variants={item} className="flex flex-wrap justify-center gap-2">
          {options.map((o) => {
            const rank = picks.indexOf(o.id) + 1
            const on = rank > 0
            return (
              <li key={o.id}>
                {/* A 36px capsule with a 40px hit area. */}
                <button type="button" role="checkbox" aria-checked={on} onClick={() => toggle(o.id)}
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
        </motion.ul>
      ) : (
        <motion.p variants={item} className="rounded-md bg-surface-2 p-3 text-center text-[13px] leading-normal text-ink-2">
          Nothing to pick for the areas you chose yet. The System will learn from what you log and pick for you.
        </motion.p>
      )}
    </>
  )
}

// ── Targets ─────────────────────────────────────────────────────────────────────────────────────────
const nfIN = new Intl.NumberFormat('en-IN')
// Limits match what the server accepts.
const SLEEP = { lo: 5, hi: 10, by: 0.5 }
const STEPS_RANGE = { lo: 1000, hi: 30000, by: 1000 }
const WATER = { lo: 500, hi: 6000, by: 250 }

function StepTargets({ v, set }: { v: V; set: Set }) {
  const bump = (k: 'sleepHours' | 'steps' | 'waterMl', r: { lo: number; hi: number; by: number }, d: number) => {
    set(k, clamp(v[k] + d * r.by, r.lo, r.hi))
    if (k === 'sleepHours') set('sleepTouched', true)
  }
  return (
    <>
      <Title title="What does a good day look like?" body="Hitting these earns XP. Pick doable, not ideal." />
      <div>
        <Row lead={<Art name="sleep" className="size-5" />} label="Sleep" sub="a night">
          <Stepper label="Sleep target" text={`${v.sleepHours}h`} onStep={(d) => bump('sleepHours', SLEEP, d)} low={v.sleepHours <= SLEEP.lo} high={v.sleepHours >= SLEEP.hi} />
        </Row>
        <Row lead={<Art name="walk" className="size-5" />} label="Steps" sub="a day">
          <Stepper label="Steps target" text={nfIN.format(v.steps)} onStep={(d) => bump('steps', STEPS_RANGE, d)} low={v.steps <= STEPS_RANGE.lo} high={v.steps >= STEPS_RANGE.hi} />
        </Row>
        {v.areas.includes('health') ? (
          <Row lead={<Art name="water" className="size-5" />} label="Water" sub="a day">
            <Stepper label="Water target" text={`${+(v.waterMl / 1000).toFixed(2)}\u202FL`} onStep={(d) => bump('waterMl', WATER, d)} low={v.waterMl <= WATER.lo} high={v.waterMl >= WATER.hi} />
          </Row>
        ) : null}
      </div>
    </>
  )
}

// ── Tone ────────────────────────────────────────────────────────────────────────────────────────────
/** One choice and what it changes: pick a tone and the sample nudge under it rewrites itself. */
function StepTone({ v, set }: { v: V; set: Set }) {
  const tone = TONES.find((t) => t.key === v.tone) ?? TONES[1]
  return (
    <>
      <Title title="How should ReLife talk to you?" body="For nudges, weekly reviews and plans." />
      <motion.div variants={item}>
        <Segmented label="Tone" options={TONES} value={v.tone} onChange={(k) => set('tone', k)} />
      </motion.div>
      {/* A nudge as it would land on your phone. Concentric: radius 16 card, 10px padding, radius 6 icon. */}
      <motion.div variants={item} className="mt-3 flex items-start gap-2.5 rounded-[16px] bg-surface p-2.5 pe-3 shadow-1" aria-live="polite">
        <CapsuleMark className="size-8 shrink-0 rounded-[6px]" />
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline justify-between gap-3 text-[12px] leading-4"><span className="font-semibold text-ink">ReLife</span><span className="text-ink-3">now</span></p>
          {/* Two lines kept, so a shorter message doesn't move the card. */}
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
      </motion.div>
    </>
  )
}

// ── Goals ───────────────────────────────────────────────────────────────────────────────────────────
function StepGoals({ v, set }: { v: V; set: Set }) {
  const id = useId()
  const add = (g: string) => set('goals', v.goals.trim() ? `${v.goals.trim().replace(/[.,]?$/, ',')} ${g.toLowerCase()}` : g)
  return (
    <>
      <Title title="What are you levelling up for?" body="In your own words. Your routines and every plan are built from this." />
      <motion.div variants={item}>
        <Field label="Goals" htmlFor={`${id}-g`}>
          <Textarea id={`${id}-g`} value={v.goals} onChange={(e) => set('goals', e.target.value)} rows={3} maxLength={2000} placeholder="Sleep 7.5 hours, ship one side project a month…" className="resize-none text-[16px] leading-normal sm:text-[14px]" />
        </Field>
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Ideas">
          {GOAL_IDEAS.filter((g) => !v.goals.toLowerCase().includes(g.toLowerCase())).slice(0, 2).map((g) => (
            // A 32px capsule with a 40px hit area.
            <button key={g} type="button" onClick={() => add(g)} className={cn('relative inline-flex h-8 items-center gap-1 rounded-full px-3 text-[12px] font-medium text-ink-2 after:absolute after:-inset-y-1 after:inset-x-0 hover:text-ink', IDLE, choice)}>
              <span aria-hidden className="text-ink-3">+</span>{g}
            </button>
          ))}
        </div>
      </motion.div>
      <motion.div variants={item} className="mt-4">
        <Field label="Anything plans should work around? (optional)" htmlFor={`${id}-c`}>
          <Input id={`${id}-c`} value={v.constraints} onChange={(e) => set('constraints', e.target.value)} maxLength={2000} placeholder="Vegetarian, office 10 to 7…" className={CONTROL} />
        </Field>
      </motion.div>
    </>
  )
}

// ── Routines ────────────────────────────────────────────────────────────────────────────────────────
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
const LINK = cn('relative rounded-sm text-[13px] font-medium text-ink underline decoration-ink/25 underline-offset-[3px] transition-[text-decoration-color] duration-150 ease-out-quint after:absolute after:-inset-x-2 after:-inset-y-2.5 hover:decoration-ink', FOCUS)

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
        className={cn('flex h-12 w-full items-center gap-2.5 rounded-[16px] ps-2 pe-2.5 text-start disabled:cursor-default', choice, have ? 'bg-surface-2/60' : on ? PICKED : IDLE)}>
        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[8px]" style={{ background: `color-mix(in oklch, ${CATEGORY[t.area].color} 14%, transparent)` }}>
          <RoutineArt name={t.name} kind={t.kind} area={t.area} className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-[13px] leading-[18px] font-medium', have ? 'text-ink-2' : 'text-ink')}>{t.name}</span>
          <span className="block truncate text-[12px] leading-4 text-ink-3">{have ? 'Already added' : sub}</span>
        </span>
        {have ? <Check className="me-0.5 size-4 shrink-0 text-ink-3" strokeWidth={2} aria-hidden /> : <Tick on={on} />}
      </button>
    </li>
  )
}

/**
 * The last step gives something back: a short starter list, or routines an AI builds from the day,
 * goals and training picks already given. Two tabs; each keeps its own ticks.
 */
function StepRoutines({ v, set, mode, templates, existing, today, ai, onAi }: {
  v: V; set: Set; mode: 'ai' | 'starter'; templates: Template[]; existing: string[]; today: string; ai: Ai | null; onAi: (a: Ai) => void
}) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const toggle = (id: string) => set('templates', v.templates.includes(id) ? v.templates.filter((x) => x !== id) : [...v.templates, id])
  const when = (t: Template) => `${describe(buildRRule({ ...t.rule, start: today }))}${t.note ? ` · ${t.note}` : ''}${t.dose ? ` · ${t.dose}` : ''}`

  const build = () => start(async () => {
    setErr(null); setEditing(false)
    const r = await suggestOnboardingRoutines({ prompt: brief(v), areas: v.areas, focus: v.focus, goals: v.goals })
    if (!r.ok) { setErr(r.error); setEditing(true); if (r.noModel) onAi({ ready: false, model: null }); return }
    set('generated', r.routines)
    set('templates', [...v.templates.filter((id) => !id.startsWith('ai-')), ...r.routines.map((x) => x.id)])
  })
  const starter = v.areas.flatMap((c) => templates.filter((t) => t.area === c))
  const results = v.generated.length > 0 && !editing

  return (
    <>
      <Title title="Start with a few routines" body="Each one gets a reminder and a streak. Change the times later." />
      <motion.div variants={item}>
        <Segmented label="Where routines come from" options={MODES} value={mode} onChange={(k) => set('routineMode', k)} />
      </motion.div>
      <motion.div variants={item} className="mt-4" aria-busy={pending}>
        {mode === 'starter' ? (
          <ul className={cn('flex flex-col gap-1.5', SCROLL)}>
            {starter.map((t) => {
              const have = existing.includes(t.name.toLowerCase())
              return <RoutineRow key={t.id} t={t} sub={when(t)} have={have} on={v.templates.includes(t.id)} onToggle={() => toggle(t.id)} />
            })}
          </ul>
        ) : !ai ? (
          <div className="h-10 animate-pulse rounded-md bg-surface-2" />
        ) : !ai.ready ? (
          <ConnectModel onReady={() => aiReady().then(onAi)} />
        ) : pending ? (
          <div className="flex flex-col gap-1.5">
            {[0, 1, 2, 3].map((k) => <div key={k} className="h-12 animate-pulse rounded-[16px] bg-surface-2" style={{ animationDelay: `${k * 100}ms` }} />)}
          </div>
        ) : results ? (
          <>
            <ul className={cn('flex flex-col gap-1.5', SCROLL)}>
              {v.generated.map((g) => <RoutineRow key={g.id} t={g} sub={g.why} on={v.templates.includes(g.id)} onToggle={() => toggle(g.id)} />)}
            </ul>
            <p className="mt-2 flex justify-center"><button type="button" onClick={() => setEditing(true)} className={LINK}>Add detail and build again</button></p>
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
      className="flex flex-col gap-3"
    >
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
function Done({ name, level }: { name: string; level: Level }) {
  const pct = Math.round(level.progress * 100)
  return (
    <>
      <Title title={`You’re in${name ? `, ${name}` : ''}.`} body="Your save file is ready. Check things off and hit your targets to earn XP." />
      <motion.div variants={item}>
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
    </>
  )
}

// ── Chrome ──────────────────────────────────────────────────────────────────────────────────────────
/** Thin capsules in the top bar, one per step. Finished ones jump back. On a phone the card's own count stands in. */
function Progress({ current, onJump }: { current: number; onJump: (k: number) => void }) {
  return (
    <ol aria-label="Setup steps" className="flex items-center max-sm:hidden">
      {STEPS.map((s, k) => {
        const state = k < current ? 'done' : k === current ? 'now' : 'next'
        return (
          <li key={s}>
            {/* 40px tall hit area around a 6px capsule. */}
            <button
              type="button"
              disabled={state !== 'done'}
              onClick={() => onJump(k)}
              title={s}
              aria-current={state === 'now' ? 'step' : undefined}
              aria-label={`Step ${k + 1} of ${STEPS.length}: ${s}${state === 'done' ? ' (done, go back)' : state === 'now' ? ' (current)' : ''}`}
              className="group flex h-10 w-7 items-center rounded-md px-[3px] disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-[-6px] focus-visible:outline-pill"
            >
              <span className="relative block h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.08] dark:bg-white/[0.1]">
                {/* Slides instead of scaling, so the round end stays round. */}
                <span className={cn(
                  'absolute inset-0 rounded-full transition-[translate,background-color,opacity] duration-300 ease-[var(--ease-out-strong)] motion-reduce:transition-none group-enabled:group-hover:opacity-60',
                  state === 'next' ? '-translate-x-[101%]' : 'translate-x-0',
                  state === 'now' ? 'bg-pill' : 'bg-ink',
                )} />
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

// Deterministic noise, so the server and the browser draw the same skyline.
const noise = (k: number) => { const x = Math.sin(k * 127.1) * 43758.5453; return x - Math.floor(x) }
/**
 * Bars sit 36px apart from the centre outward and climb from left to right, like XP over the days ahead.
 * `seed` gives a second, different row for the pale skyline behind.
 */
const bars = (seed: number, lift: number) => Array.from({ length: 81 }, (_, n) => {
  const k = n - 40
  return { k, h: Math.min(0.98, Math.max(0.1, 0.44 + lift + 0.011 * k + (noise(k + seed) - 0.5) * 0.3 + (noise((k + seed) * 3.7) > 0.86 ? 0.14 : 0))) }
})
const SKYLINES = [
  { rows: bars(57, 0.16), shift: 5, tone: 'opacity-25 dark:opacity-20' }, // behind: taller, paler, half a step across
  { rows: bars(0, 0), shift: -13, tone: 'opacity-75 dark:opacity-60' },
]
/** Capsules in flight: where each starts (% from the left and the bottom), its size, pace and drift. */
const MOTES = [
  { x: 6, b: 14, s: 0.5, t: 19, d: -4, dx: 26, o: 0.9 }, { x: 14, b: 6, s: 0.34, t: 26, d: -15, dx: -18, o: 0.55 },
  { x: 22, b: 20, s: 0.6, t: 17, d: -9, dx: 14, o: 1 }, { x: 30, b: 9, s: 0.4, t: 23, d: -1, dx: 30, o: 0.7 },
  { x: 70, b: 18, s: 0.34, t: 27, d: -7, dx: 16, o: 0.55 }, { x: 78, b: 10, s: 0.56, t: 18, d: -12, dx: -22, o: 1 },
  { x: 86, b: 24, s: 0.38, t: 24, d: -3, dx: 20, o: 0.65 }, { x: 94, b: 12, s: 0.6, t: 16, d: -6, dx: -14, o: 1 },
]

/**
 * Behind the card: the app's paper and capsule-blue glow, the halftone corner, and along the bottom a
 * halftone skyline of XP bars. `progress` (0 to 1) raises the skyline as setup goes on; the drifting
 * capsules take the colours of the picked areas. Decorative only, and hidden on a phone.
 */
function Backdrop({ progress, areas }: { progress: number; areas: Category[] }) {
  const colors = areas.length ? areas.map((c) => CATEGORY[c].color) : ['var(--pill)']
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden max-sm:hidden">
      <div className="absolute inset-0" style={{ background: 'radial-gradient(70% 60% at 50% -10%, color-mix(in oklch, var(--pill) 14%, transparent), transparent 70%)' }} />
      <div className="halftone top-0 right-0 h-1/2 w-2/5" />
      {SKYLINES.map((sky) => (
        <div key={sky.shift} className={cn('skyline absolute inset-x-0 bottom-0 h-[min(40vh,360px)]', sky.tone)}>
          {sky.rows.map((b) => (
            <span key={b.k} className="skyline-bar" style={{
              left: `calc(50% + ${b.k * 36 + sky.shift}px)`,
              '--h': `${(b.h * (0.42 + 0.58 * progress) * 100).toFixed(1)}%`,
              '--i': Math.abs(b.k),
            } as React.CSSProperties} />
          ))}
        </div>
      ))}
      {MOTES.map((m, k) => (
        <span key={k} className="mote" style={{
          left: `${m.x}%`, bottom: `${m.b}%`, filter: m.s < 0.4 ? 'blur(0.6px)' : undefined,
          '--t': `${m.t}s`, '--d': `${m.d}s`, '--dx': `${m.dx}px`, '--o': m.o, '--rise': '40vh',
        } as React.CSSProperties}>
          <span className="block" style={{ scale: m.s }}><CapsuleIcon color={colors[k % colors.length]} size="sm" /></span>
        </span>
      ))}
    </div>
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
