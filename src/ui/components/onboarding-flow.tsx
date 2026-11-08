'use client'

import Link from 'next/link'
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'motion/react'
import { useEffect, useId, useMemo, useRef, useState, useTransition } from 'react'
import { ArrowLeft, ArrowRight, Brain, Check, Code, HeartPulse, Palette, Cable, Sparkles, Users, Wallet, type LucideIcon } from 'lucide-react'
import { RoutineArt } from './routine-art'
import type { Category } from '@/db/schema'
import type { Template } from '@/core/onboarding'
import type { SuggestedRoutine } from '@/ai/routines'
import { buildRRule, describe } from '@/domain/recurrence'
import { aiReady, connectIntegration, finishOnboarding, skipOnboardingAction, suggestOnboardingRoutines } from '@/app/actions'
import { CATEGORY } from '../tokens'
import { Button, buttonClass } from './button'
import { Input, Textarea } from './form'
import { CurrencyPicker, TimezonePicker } from './region-picker'
import { Wordmark } from './logo'
import { LevelRing } from './xp'
import { cn } from '../cn'
import { EASE_OUT_STRONG } from '@/ui/beui/lib/ease'

// One-time setup. Seen once, so it can afford a little delight: steps slide in the direction you're
// going and their content staggers in. Choices respond instantly (≤150ms, colour + press scale).

const SPRING = { type: 'spring', duration: 0.3, bounce: 0 } as const

const stepMotion: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 32, filter: 'blur(4px)' }),
  center: { opacity: 1, x: 0, filter: 'blur(0px)', transition: { duration: 0.4, ease: EASE_OUT_STRONG, staggerChildren: 0.06, delayChildren: 0.04 } },
  // Exits are softer than enters: shorter distance, quicker.
  exit: (dir: number) => ({ opacity: 0, x: dir * -16, filter: 'blur(2px)', transition: { duration: 0.18, ease: EASE_OUT_STRONG } }),
}
const item: Variants = {
  enter: { opacity: 0, y: 10 },
  center: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE_OUT_STRONG } },
  exit: {},
}

const AREA_ICON: Record<Category, LucideIcon> = { health: HeartPulse, mind: Brain, skills: Code, wealth: Wallet, hobbies: Palette, relationships: Users }
const AREAS = Object.keys(CATEGORY) as Category[]
const TONES = [
  { key: 'gentle', label: 'Gentle', example: '“Nice work on sleep this week. Try lights out 15 minutes earlier?”' },
  { key: 'balanced', label: 'Balanced', example: '“Sleep is up, spending too. One change: cook twice this week.”' },
  { key: 'blunt', label: 'Blunt', example: '“Food delivery is 32% over. Delete Zomato for two weeks.”' },
] as const
const GOAL_IDEAS = ['Sleep 7.5 hours', 'Ship a side project', 'Save 30% of income', 'Read 12 books this year', 'Call family every week', 'Exercise 3 times a week']

type Initial = {
  name: string; timezone: string; baseCurrency: string; areas: Category[]; focus?: Category
  goals: string; constraints: string; tone: 'gentle' | 'balanced' | 'blunt'
  sleepHours: number; steps: number; waterMl: number
}

// Browsers list some zones under old names (Asia/Calcutta), so accept anything Intl understands.
const validTz = (tz: string) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true } catch { return false } }

const STEPS = ['You', 'Areas', 'Routines', 'Targets', 'Goals'] as const

// Shared column: header, step content and actions all line up on the same edges.
const COL = 'mx-auto w-full max-w-[624px] px-5 sm:px-8'

export function OnboardingFlow({ initial, templates, existing, timezones, currencies, today, level, fresh }: {
  initial: Initial; templates: Template[]; existing: string[]; timezones: string[]; currencies: string[]; today: string
  level: Level
  /** First time through: finishing clears earlier XP for a fresh start at Level 1. */
  fresh: boolean
}) {
  const [i, setI] = useState(0)
  const [dir, setDir] = useState(1)
  const [v, setV] = useState({
    ...initial,
    areas: initial.areas.length ? initial.areas : (['health', 'mind', 'skills'] as Category[]),
    // Nothing picked until the user asks the AI (or opens the starter list): no generic routines by default.
    templates: [] as string[],
    generated: [] as SuggestedRoutine[],
    prompt: '',
    routineMode: 'ai' as 'ai' | 'starter',
  })
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  // After Finish: a short "personalizing" pass while the server saves, then the all-set pop-up.
  const [working, setWorking] = useState(false)
  const [result, setResult] = useState<{ added: number; level: Level } | null>(null)
  const done = working
  const scroller = useRef<HTMLElement>(null)

  // Suggest this device's time zone and currency the first time through. The clock is read after
  // mount so server and client render the same markup.
  const [device, setDevice] = useState<{ tz: string; cur: string | null; now: Date } | null>(null)
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const region = new Intl.Locale(navigator.language).maximize().region
    setDevice({ tz, cur: region ? REGION_CURRENCY[region] ?? null : null, now: new Date() })
  }, [])

  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => { setV((s) => ({ ...s, [k]: val })); setError(null) }

  const check = (): string | null => {
    if (i === 0 && !v.name.trim()) return 'Add your name'
    if (i === 0 && !validTz(v.timezone)) return 'Pick a time zone from the list'
    if (i === 0 && !currencies.includes(v.baseCurrency.toUpperCase())) return 'Use a currency code like INR or USD'
    if (i === 1 && !v.areas.length) return 'Pick at least one area'
    return null
  }
  const go = (to: number) => { setDir(to > i ? 1 : -1); setI(to); setError(null); scroller.current?.scrollTo({ top: 0 }) }
  const next = () => {
    const e = check()
    if (e) return setError(e)
    if (i < STEPS.length - 1) return go(i + 1)
    setDir(1); setWorking(true); scroller.current?.scrollTo({ top: 0 })
    start(async () => {
      // Hold the checklist long enough to read, even when the save is instant.
      const [r] = await Promise.all([
        finishOnboarding({ ...v, baseCurrency: v.baseCurrency.toUpperCase(), focus: v.focus ?? v.areas[0] }),
        new Promise((ok) => setTimeout(ok, TASK_MS * 4 + 400)),
      ])
      if (!r.ok) { setWorking(false); setDir(-1); return setError(r.error) }
      setResult({ added: r.added, level: r.level })
      window.dispatchEvent(new Event('relife:celebrate'))
    })
  }

  // Enter continues (except inside multi-line fields).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.shiftKey || e.defaultPrevented || done || pending) return
      if ((e.target as HTMLElement).tagName === 'TEXTAREA') return
      if ((e.target as HTMLElement).tagName === 'BUTTON') return
      e.preventDefault(); next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const step = done ? STEPS.length : i
  const all = useMemo(() => [...templates, ...v.generated], [templates, v.generated])
  const body = done ? <Personalizing v={v} templates={all} existing={existing} finished={!!result} fresh={fresh} level={level.level} /> : (
    <>
      {i === 0 ? <StepYou v={v} set={set} device={device} timezones={timezones} currencies={currencies} level={(result?.level ?? level).level} /> : null}
      {i === 1 ? <StepAreas v={v} set={set} /> : null}
      {i === 2 ? <StepRoutines v={v} set={set} templates={templates} existing={existing} today={today} /> : null}
      {i === 3 ? <StepTargets v={v} set={set} /> : null}
      {i === 4 ? <StepGoals v={v} set={set} /> : null}
    </>
  )

  return (
    <div className="fixed inset-0 z-[60] bg-bg">
      <div className="mx-auto grid h-dvh max-w-[1480px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:p-3">
        <Stage v={v} templates={all} existing={existing} step={done ? STEPS.length : i} now={device?.now ?? null} level={(result?.level ?? level).level} />

        <div className="flex min-h-0 flex-col">
          <header className={cn(COL, 'flex flex-col gap-3 pt-[max(1rem,env(safe-area-inset-top))] lg:pt-6')}>
            <div className="flex h-10 items-center justify-between gap-4">
              <Wordmark className="h-7 lg:hidden" />
              <p className="hidden text-[13px] font-medium text-ink-3 tabular-nums lg:block">
                {done ? (result ? 'All set' : 'Finishing…') : <>Step {i + 1} of {STEPS.length} <span aria-hidden>·</span> <span className="text-ink">{STEPS[i]}</span></>}
              </p>
              {!done ? (
                <button
                  type="button"
                  onClick={() => start(async () => { await skipOnboardingAction(); window.location.assign('/') })}
                  className="-me-3 h-10 rounded-md px-3 text-[13.5px] font-medium text-ink-3 transition-[color,scale] duration-150 ease-out-quint hover:text-ink active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill"
                >
                  Skip for now
                </button>
              ) : null}
            </div>
            <Progress current={step} onJump={(k) => { if (!done && k < i) go(k) }} />
          </header>

          {/* Only the step scrolls; the header and actions stay put. Edges fade instead of cutting. */}
          <main ref={scroller} className="min-h-0 flex-1 overflow-y-auto [mask-image:linear-gradient(to_bottom,transparent,black_20px,black_calc(100%-40px),transparent)]">
            <div className={cn(COL, 'flex min-h-full flex-col justify-center py-8 lg:py-10')}>
              <AnimatePresence mode="wait" custom={dir} initial={false}>
                <motion.section key={done ? 'done' : i} custom={dir} variants={stepMotion} initial="enter" animate="center" exit="exit" aria-live="polite">
                  {body}
                </motion.section>
              </AnimatePresence>
            </div>
          </main>

          {!done ? (
            <footer className={cn(COL, 'flex items-center gap-3 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] lg:pb-8')}>
              {i > 0 ? (
                <Button variant="ghost" onClick={() => go(i - 1)} disabled={pending} className="-ms-3"><ArrowLeft className="size-4 rtl:-scale-x-100" strokeWidth={2} />Back</Button>
              ) : null}
              <p role="alert" className={cn('min-w-0 flex-1 text-end text-[13px] text-bad transition-[opacity] duration-150', error ? 'opacity-100' : 'opacity-0')}>{error ?? ''}</p>
              <span aria-hidden className={cn('hidden shrink-0 text-[12px] text-ink-3 lg:inline', error && 'lg:hidden')}>Enter ↵</span>
              <Button variant="primary" size="lg" onClick={next} disabled={pending} className="shrink-0">
                {i === STEPS.length - 1 ? (pending ? 'Setting up…' : 'Finish setup') : 'Continue'}
                {i < STEPS.length - 1 ? <ArrowRight className="size-4 rtl:-scale-x-100" strokeWidth={2} /> : null}
              </Button>
            </footer>
          ) : null}
        </div>
      </div>
      <AnimatePresence>{result ? <AllSet key="all-set" v={v} added={result.added} level={result.level} /> : null}</AnimatePresence>
    </div>
  )
}

type Level = { level: number; title: string; progress: number }

type V = Initial & { templates: string[]; generated: SuggestedRoutine[]; prompt: string; routineMode: 'ai' | 'starter' }
type Set = <K extends keyof V>(k: K, val: V[K]) => void

function Title({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <motion.div variants={item} className="mb-6">
      <div className="text-[12px] font-semibold tracking-[0.08em] text-pill-ink uppercase">{eyebrow}</div>
      <h1 className="mt-2 font-display text-[32px] leading-[1.08] font-extrabold tracking-[-0.03em] text-ink sm:text-[38px]">{title}</h1>
      <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-ink-2">{body}</p>
    </motion.div>
  )
}

/** Check badge that pops in with scale 0.25→1, opacity, blur 4px→0 (spring 0.3s, no bounce). */
function Tick({ on, color = 'var(--pill)' }: { on: boolean; color?: string }) {
  return (
    <span aria-hidden className="relative grid size-6 shrink-0 place-items-center rounded-full transition-[box-shadow] duration-150" style={{ boxShadow: on ? 'none' : 'inset 0 0 0 1.5px var(--hairline)' }}>
      <AnimatePresence initial={false}>
        {on ? (
          <motion.span
            key="on"
            initial={{ scale: 0.25, opacity: 0, filter: 'blur(4px)' }}
            animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
            exit={{ scale: 0.25, opacity: 0, filter: 'blur(4px)' }}
            transition={SPRING}
            className="absolute inset-0 grid place-items-center rounded-full text-white"
            style={{ background: color }}
          >
            <Check className="size-3.5" strokeWidth={3} />
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  )
}

const choice = 'transition-[background-color,box-shadow,scale] duration-150 ease-out-quint active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill'

function StepYou({ v, set, device, timezones, currencies, level }: { v: V; set: Set; device: { tz: string; cur: string | null; now: Date } | null; timezones: string[]; currencies: string[]; level: number }) {
  const id = useId()
  const now = useMemo(() => { try { return new Intl.DateTimeFormat('en-GB', { timeZone: v.timezone, hour: '2-digit', minute: '2-digit' }).format(new Date()) } catch { return null } }, [v.timezone])
  const name = v.name.trim()
  return (
    <>
      <Title eyebrow="New save file" title="Who’s playing?" body="Two minutes to set up your save. Everything can be changed later in Settings." />

      {/* Character creation: the card fills in as you type. Wide screens show the full preview beside it. */}
      <motion.div variants={item} className="flex items-center gap-4 rounded-[20px] bg-surface p-4 shadow-1 lg:hidden">
        <span
          aria-hidden
          className="grid size-14 shrink-0 place-items-center rounded-[16px] font-display text-[24px] font-extrabold text-night shadow-[inset_0_1px_0_oklch(1_0_0/0.6)]"
          style={{ background: 'linear-gradient(135deg, var(--sky) 0%, color-mix(in oklch, var(--sky) 45%, var(--sakura)) 55%, var(--sakura) 100%)' }}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={name[0]?.toUpperCase() ?? '?'} initial={{ scale: 0.25, opacity: 0, filter: 'blur(4px)' }} animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }} exit={{ scale: 0.25, opacity: 0, filter: 'blur(4px)' }} transition={SPRING}>
              {name[0]?.toUpperCase() ?? '?'}
            </motion.span>
          </AnimatePresence>
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate font-display text-[20px] leading-tight font-extrabold tracking-[-0.02em]', name ? 'text-ink' : 'text-ink-3')}>{name || 'Your name'}</span>
          <span className="mt-1 flex items-center gap-2 text-[12.5px] text-ink-3 tabular-nums">
            <span className="inline-flex h-5 items-center rounded-full bg-ink px-1.5 text-[11px] font-bold text-bg">Lv {level}</span>
            Awakened{now ? ` · ${now} local` : ''} · {v.baseCurrency.toUpperCase()}
          </span>
        </span>
      </motion.div>

      <motion.div variants={item} className="mt-6 flex flex-col gap-2 lg:mt-0">
        <label htmlFor={`${id}-n`} className="text-[13.5px] font-medium text-ink">What should we call you?</label>
        <Input id={`${id}-n`} value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="Your first name" autoComplete="given-name" maxLength={60} autoFocus className="h-12 text-[16px]" />
      </motion.div>
      <motion.div variants={item} className="mt-6 grid gap-5 sm:grid-cols-[minmax(0,1fr)_180px]">
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-tz`} className="text-[13.5px] font-medium text-ink">Time zone</label>
          <TimezonePicker id={`${id}-tz`} value={v.timezone} onChange={(z) => set('timezone', z)} options={timezones} suggested={[device?.tz]} />
          <p className="text-[12.5px] text-ink-3">Your day, streak and reminders follow it.</p>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-cur`} className="text-[13.5px] font-medium text-ink">Currency</label>
          <CurrencyPicker id={`${id}-cur`} value={v.baseCurrency} onChange={(c) => set('baseCurrency', c)} options={currencies} suggested={[device?.cur]} />
          <p className="text-[12.5px] text-ink-3">Totals show in this.</p>
        </div>
      </motion.div>
    </>
  )
}

function StepAreas({ v, set }: { v: V; set: Set }) {
  const toggle = (c: Category) => {
    const next = v.areas.includes(c) ? v.areas.filter((x) => x !== c) : [...v.areas, c]
    set('areas', next)
    if (v.focus && !next.includes(v.focus)) set('focus', undefined)
  }
  const focus = v.focus ?? v.areas[0]
  return (
    <>
      <Title eyebrow="Your areas" title="Which parts of life do you want to work on?" body="Pick as many as you like. Areas you skip stay out of your sidebar, and you can turn them on later." />
      <motion.ul variants={item} className="grid gap-3 sm:grid-cols-2">
        {AREAS.map((c) => {
          const on = v.areas.includes(c)
          const Icon = AREA_ICON[c]
          return (
            <li key={c}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(c)}
                className={cn('flex w-full items-center gap-3.5 rounded-lg p-4 text-start', choice, on ? 'bg-surface' : 'bg-surface/60 shadow-[inset_0_0_0_1px_var(--hairline)] hover:bg-surface')}
                style={on ? { boxShadow: `0 0 0 2px ${CATEGORY[c].color}, var(--elev-1)` } : undefined}
              >
                <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[12px]" style={{ color: CATEGORY[c].color, background: CATEGORY[c].wash }}><Icon className="size-5" strokeWidth={2} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-ink">{CATEGORY[c].label}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-3">{CATEGORY[c].blurb}</span>
                </span>
                <Tick on={on} color={CATEGORY[c].color} />
              </button>
            </li>
          )
        })}
      </motion.ul>
      {v.areas.length > 1 ? (
        <motion.div variants={item} className="mt-8">
          <h2 className="text-[13.5px] font-medium text-ink">Which one comes first?</h2>
          <p className="mt-1 text-[12.5px] text-ink-3">Suggestions lean toward your focus area.</p>
          <div role="radiogroup" aria-label="Focus area" className="mt-3 flex flex-wrap gap-2">
            {v.areas.map((c) => {
              const on = focus === c
              return (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => set('focus', c)}
                  className={cn('inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13.5px] font-medium', choice, on ? 'bg-ink text-bg shadow-1' : 'bg-surface text-ink-2 shadow-1 hover:text-ink')}
                >
                  <span aria-hidden className="size-2 rounded-full" style={{ background: CATEGORY[c].color }} />
                  {CATEGORY[c].label}
                </button>
              )
            })}
          </div>
        </motion.div>
      ) : null}
    </>
  )
}

const PROMPT_IDEAS = [
  'I wake up around 7',
  'Office 10 to 7, Tue to Thu',
  'Gym three times a week',
  'I want to read more',
  'I take vitamin D',
  'Too much phone at night',
  'Learning to code after work',
  'Want to call my parents more',
]

const PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic', logo: 'anthropic', model: 'claude-sonnet-5-5', key: 'ANTHROPIC_API_KEY', keyHint: 'sk-ant-…' },
  { id: 'openai', name: 'OpenAI', logo: 'openai', model: '', key: 'OPENAI_API_KEY', keyHint: 'sk-…' },
  { id: 'google', name: 'Gemini', logo: 'gemini', model: '', key: 'GOOGLE_GENERATIVE_AI_API_KEY', keyHint: 'From Google AI Studio' },
  { id: 'openrouter', name: 'OpenRouter', logo: 'openrouter', model: '', key: 'OPENROUTER_API_KEY', keyHint: 'sk-or-…' },
] as const

/**
 * Routines made for you: describe your days in your own words and the AI proposes a handful of small
 * routines that fit them, each with a reason. No model yet: connect one right here, or use the
 * starter list instead.
 */
function StepRoutines({ v, set, templates, existing, today }: { v: V; set: Set; templates: Template[]; existing: string[]; today: string }) {
  const [ai, setAi] = useState<{ ready: boolean; model: string | null } | null>(null)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { aiReady().then(setAi) }, [])

  const build = () => start(async () => {
    setErr(null)
    const r = await suggestOnboardingRoutines({ prompt: v.prompt, areas: v.areas, focus: v.focus, goals: v.goals })
    if (!r.ok) { setErr(r.error); if (r.noModel) setAi({ ready: false, model: null }); return }
    set('generated', r.routines)
    set('templates', r.routines.map((x) => x.id)) // AI picks replace any starter picks
  })
  const addIdea = (idea: string) => set('prompt', v.prompt.trim() ? `${v.prompt.trim().replace(/[.,]?$/, '.')} ${idea}.` : `${idea}.`)
  const picked = v.generated.filter((g) => v.templates.includes(g.id)).length

  if (v.routineMode === 'starter') {
    return (
      <>
        <Title eyebrow="Starter routines" title="Pick a few to try this week." body="A short list to get going. Each one gets a reminder and a streak, and you can change times later." />
        <StarterList v={v} set={set} templates={templates} existing={existing} today={today} />
        <motion.button variants={item} type="button" onClick={() => { set('routineMode', 'ai'); set('templates', v.generated.map((g) => g.id)) }} className="mt-2 inline-flex h-10 items-center gap-2 self-start rounded-full px-1 text-[13.5px] font-medium text-pill-ink hover:underline">
          <Sparkles className="size-4" strokeWidth={2} aria-hidden />Make routines for me with AI instead
        </motion.button>
      </>
    )
  }

  return (
    <>
      <Title eyebrow="Your routines" title="Tell us about your days." body="Your schedule, what you want to change, what already works. The AI turns it into a few small routines that fit your life." />

      <motion.div variants={item} className="flex flex-col gap-3">
        <label htmlFor="routine-prompt" className="sr-only">Describe your days</label>
        <div className="rounded-[20px] bg-surface p-1.5 shadow-1 transition-[box-shadow] duration-150 focus-within:shadow-[0_0_0_2px_var(--pill),var(--elev-1)]">
          <textarea
            id="routine-prompt"
            value={v.prompt}
            onChange={(e) => set('prompt', e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && ai?.ready) { e.preventDefault(); build() } }}
            rows={4}
            maxLength={1500}
            placeholder="I wake up around 7 and work 10 to 7. I want to sleep earlier, get back to the gym and read before bed. I take vitamin D."
            className="block w-full resize-none rounded-[14px] bg-transparent px-3.5 py-3 text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-3"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-1">
            <span className="text-[12px] text-ink-3">{ai?.ready ? `Uses ${ai.model?.split(':')[1] ?? 'your model'} · ⌘↵ to build` : ' '}</span>
            {ai?.ready ? (
              <Button variant="primary" onClick={build} disabled={pending || v.prompt.trim().length < 8}>
                <Sparkles className={cn('size-4', pending && 'animate-pulse')} strokeWidth={2} />
                {pending ? 'Building…' : v.generated.length ? 'Build again' : 'Build my routines'}
              </Button>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5" aria-label="Ideas">
          {PROMPT_IDEAS.filter((g) => !v.prompt.toLowerCase().includes(g.toLowerCase())).slice(0, 6).map((g) => (
            <button key={g} type="button" onClick={() => addIdea(g)} className={cn('inline-flex h-8 items-center gap-1 rounded-full bg-surface px-3 text-[12.5px] text-ink-2 shadow-1 hover:text-ink', choice)}>
              <span aria-hidden className="text-ink-3">+</span>{g}
            </button>
          ))}
        </div>
        {err ? <p role="alert" className="text-[13px] text-bad">{err}</p> : null}
      </motion.div>

      {ai && !ai.ready ? <ConnectModel onReady={() => aiReady().then(setAi)} /> : null}

      {/* Results: skeletons while the model thinks, then the proposals. */}
      {pending ? (
        <div aria-busy className="mt-6 flex flex-col gap-2">
          {[0, 1, 2].map((k) => <div key={k} className="h-[76px] animate-pulse rounded-[16px] bg-ink/[0.05] dark:bg-white/[0.06]" style={{ animationDelay: `${k * 120}ms` }} />)}
        </div>
      ) : v.generated.length ? (
        <section aria-label="Routines for you" className="mt-6">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-[12px] font-semibold tracking-[0.08em] text-ink-3 uppercase">Made for you</h2>
            <span className="text-[12px] text-ink-3 tabular-nums">{picked} of {v.generated.length} picked</span>
          </div>
          <ul className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {v.generated.map((g, k) => {
                const on = v.templates.includes(g.id)
                const c = CATEGORY[g.area].color
                return (
                  <motion.li key={g.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE_OUT_STRONG, delay: k * 0.06 } }}>
                    <button
                      type="button" role="checkbox" aria-checked={on}
                      onClick={() => set('templates', on ? v.templates.filter((x) => x !== g.id) : [...v.templates, g.id])}
                      className={cn('flex w-full items-start gap-3.5 rounded-[16px] p-3.5 text-start', choice, on ? 'bg-surface shadow-1' : 'bg-surface/50 shadow-[inset_0_0_0_1px_var(--hairline)] hover:bg-surface')}
                    >
                      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[11px]" style={{ color: `color-mix(in oklch, ${c} 80%, var(--ink))`, background: `color-mix(in oklch, ${c} 16%, transparent)` }}>
                        <RoutineArt name={g.name} kind={g.kind} area={g.area} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14.5px] font-medium text-ink">{g.name}</span>
                        <span className="mt-0.5 block text-[12.5px] text-ink-3">
                          {describe(buildRRule({ ...g.rule, start: today }))}{g.note ? ` · ${g.note}` : ''}{g.dose ? ` · ${g.dose}` : ''}
                        </span>
                        <span className="mt-1.5 block text-[12.5px] leading-snug text-ink-2">{g.why}</span>
                      </span>
                      <span className="mt-2"><Tick on={on} color={c} /></span>
                    </button>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
        </section>
      ) : null}

      <motion.button variants={item} type="button" onClick={() => set('routineMode', 'starter')} className="mt-5 inline-flex h-10 items-center self-start rounded-full px-1 text-[13px] text-ink-3 hover:text-ink">
        Rather pick from a starter list?
      </motion.button>
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
    <motion.form
      ref={form} variants={item}
      onSubmit={(e) => { e.preventDefault(); submit() }}
      // Enter here connects; it must not trigger setup's Continue.
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
      className="mt-6 flex flex-col gap-4 rounded-[20px] bg-surface p-5 shadow-1"
    >
      <div>
        <h2 className="text-[15px] font-semibold text-ink">Connect an AI model to build your routines</h2>
        <p className="mt-0.5 text-[13px] text-ink-3">Your key is encrypted on this Mac and only sent to the provider. The same model writes your nudges and weekly reviews.</p>
      </div>
      <div role="radiogroup" aria-label="Provider" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PROVIDERS.map((x) => {
          const on = x.id === p.id
          return (
            <button key={x.id} type="button" role="radio" aria-checked={on} onClick={() => setP(x)}
              className={cn('flex h-11 items-center gap-2 rounded-[12px] px-3 text-[13.5px] font-medium', choice, on ? 'bg-surface text-ink shadow-[0_0_0_2px_var(--pill),var(--elev-1)]' : 'bg-surface-2/60 text-ink-2 shadow-[inset_0_0_0_1px_var(--hairline)] hover:text-ink')}>
              <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-[7px] bg-white shadow-[0_0_0_1px_oklch(0_0_0/0.08)]">
                {/* eslint-disable-next-line @next/next/no-img-element -- local logos */}
                <img src={`/connectors/${x.logo}.svg`} alt="" className="size-4" />
              </span>
              {x.name}
            </button>
          )
        })}
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
          API key
          <Input key={p.id} name={p.key} type="password" autoComplete="off" spellCheck={false} placeholder={p.keyHint} className="h-11 font-mono text-[13px]" />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
          Model
          <Input key={`${p.id}-m`} name="LLM_DEFAULT" defaultValue={p.model} spellCheck={false} placeholder="model name" className="h-11 font-mono text-[13px]" />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="alert" className="text-[13px] text-bad">{err ?? ''}</p>
        <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Connecting…' : `Connect ${p.name}`}</Button>
      </div>
    </motion.form>
  )
}

/** The fallback: a short, curated list grouped by area. */
function StarterList({ v, set, templates, existing, today }: { v: V; set: Set; templates: Template[]; existing: string[]; today: string }) {
  const toggle = (id: string) => set('templates', v.templates.includes(id) ? v.templates.filter((x) => x !== id) : [...v.templates, id])
  return (
    <>
      {v.areas.map((c) => (
        <motion.section key={c} variants={item} className="mb-6">
          <h2 className="mb-2 flex items-center gap-2 text-[12px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
            <span aria-hidden className="size-2 rounded-full" style={{ background: CATEGORY[c].color }} />{CATEGORY[c].label}
          </h2>
          <ul className="flex flex-col gap-2">
            {templates.filter((t) => t.area === c).map((t) => {
              const have = existing.includes(t.name.toLowerCase())
              const on = have || v.templates.includes(t.id)
              return (
                <li key={t.id}>
                  <button
                    type="button" role="checkbox" aria-checked={on} disabled={have} onClick={() => toggle(t.id)}
                    className={cn('flex min-h-[60px] w-full items-center gap-3.5 rounded-[16px] px-3.5 py-2.5 text-start disabled:cursor-default', choice, on ? 'bg-surface shadow-1' : 'bg-surface/50 shadow-[inset_0_0_0_1px_var(--hairline)] hover:bg-surface')}
                  >
                    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[10px]" style={{ color: `color-mix(in oklch, ${CATEGORY[c].color} 80%, var(--ink))`, background: `color-mix(in oklch, ${CATEGORY[c].color} 16%, transparent)` }}>
                      <RoutineArt name={t.name} kind={t.kind} area={t.area} className="size-[22px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] text-ink">{t.name}</span>
                      <span className="mt-0.5 block truncate text-[12.5px] text-ink-3">
                        {describe(buildRRule({ ...t.rule, start: today }))}{t.quantity ? ' · goal set on the next step' : ''}{t.note ? ` · ${t.note}` : ''}{t.dose ? ` · ${t.dose}` : ''}
                      </span>
                    </span>
                    {have ? <span className="shrink-0 text-[12px] font-medium text-ink-3">Already added</span> : <Tick on={on} color={CATEGORY[c].color} />}
                  </button>
                </li>
              )
            })}
          </ul>
        </motion.section>
      ))}
    </>
  )
}

function Segmented<T extends number | string>({ label, options, value, onChange, format }: {
  label: string; options: T[]; value: T; onChange: (v: T) => void; format: (v: T) => string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-4 gap-1 rounded-lg bg-surface-2 p-1 shadow-[inset_0_0_0_1px_var(--hairline)]">
      {options.map((o) => {
        const on = o === value
        return (
          <button
            key={String(o)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o)}
            className={cn('h-10 rounded-md text-[14px] font-medium tabular-nums', choice, on ? 'bg-surface text-ink shadow-1' : 'text-ink-3 hover:text-ink')}
          >
            {format(o)}
          </button>
        )
      })}
    </div>
  )
}

function StepTargets({ v, set }: { v: V; set: Set }) {
  const nf = new Intl.NumberFormat('en-IN')
  return (
    <>
      <Title eyebrow="Daily targets" title="What does a good day look like?" body="These set your goal lines on charts and the XP you earn for hitting them. Pick what feels doable, not ideal." />
      {/* Label beside its control on wider screens so the whole step fits without scrolling. */}
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <TargetRow label="Sleep"><Segmented label="Sleep target" options={[7, 7.5, 8, 8.5]} value={v.sleepHours} onChange={(x) => set('sleepHours', x)} format={(x) => `${x}h`} /></TargetRow>
          <TargetRow label="Steps"><Segmented label="Steps target" options={[5000, 8000, 10000, 12000]} value={v.steps} onChange={(x) => set('steps', x)} format={(x) => nf.format(x)} /></TargetRow>
          {v.areas.includes('health') ? (
            <TargetRow label="Water"><Segmented label="Water target" options={[2000, 2500, 3000, 3500]} value={v.waterMl} onChange={(x) => set('waterMl', x)} format={(x) => `${(x / 1000).toFixed(1).replace('.0', '')} L`} /></TargetRow>
          ) : null}
        </div>
        <motion.div variants={item}>
          <h2 className="text-[13.5px] font-medium text-ink">How should ReLife talk to you?</h2>
          <p className="mt-0.5 mb-2.5 text-[12.5px] text-ink-3">Used for nudges, weekly reviews and plans from your AI model.</p>
          <div role="radiogroup" aria-label="Tone" className="grid gap-2 sm:grid-cols-3">
            {TONES.map((t) => {
              const on = v.tone === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => set('tone', t.key)}
                  className={cn('flex flex-col items-start gap-1.5 rounded-lg p-3.5 text-start', choice, on ? 'bg-surface shadow-[0_0_0_2px_var(--pill),var(--elev-1)]' : 'bg-surface/60 shadow-[inset_0_0_0_1px_var(--hairline)] hover:bg-surface')}
                >
                  <span className="flex w-full items-center justify-between text-[14.5px] font-semibold text-ink">{t.label}<Tick on={on} /></span>
                  <span className="text-[12.5px] leading-snug text-ink-3">{t.example}</span>
                </button>
              )
            })}
          </div>
        </motion.div>
      </div>
    </>
  )
}

function TargetRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <motion.div variants={item} className="grid gap-2 sm:grid-cols-[72px_minmax(0,1fr)] sm:items-center sm:gap-4">
      <h2 className="text-[13.5px] font-medium text-ink">{label}</h2>
      {children}
    </motion.div>
  )
}

function StepGoals({ v, set }: { v: V; set: Set }) {
  const id = useId()
  const add = (g: string) => set('goals', v.goals.trim() ? `${v.goals.trim().replace(/[.,]?$/, ',')} ${g.toLowerCase()}` : g)
  return (
    <>
      <Title eyebrow="Your why" title="What does levelling up mean to you?" body="In your own words. Your AI model reads this before every plan, so the more honest, the better the suggestions." />
      <motion.div variants={item} className="flex flex-col gap-2">
        <label htmlFor={`${id}-g`} className="text-[13.5px] font-medium text-ink">Goals</label>
        <Textarea id={`${id}-g`} value={v.goals} onChange={(e) => set('goals', e.target.value)} rows={4} maxLength={2000} placeholder="Sleep 7.5 hours, ship one side project a month, save 30% of income…" className="text-[15px]" />
        <div className="mt-1 flex flex-wrap gap-1.5" aria-label="Ideas">
          {GOAL_IDEAS.filter((g) => !v.goals.toLowerCase().includes(g.toLowerCase())).map((g) => (
            <button key={g} type="button" onClick={() => add(g)} className={cn('inline-flex h-8 items-center gap-1 rounded-full bg-surface px-3 text-[12.5px] text-ink-2 shadow-1 hover:text-ink', choice)}>
              <span aria-hidden className="text-ink-3">+</span>{g}
            </button>
          ))}
        </div>
      </motion.div>
      <motion.div variants={item} className="mt-6 flex flex-col gap-2">
        <label htmlFor={`${id}-c`} className="text-[13.5px] font-medium text-ink">Anything plans should work around? <span className="font-normal text-ink-3">(optional)</span></label>
        <Textarea id={`${id}-c`} value={v.constraints} onChange={(e) => set('constraints', e.target.value)} rows={2} maxLength={2000} placeholder="Vegetarian, office 10 to 7, night shifts on weekends…" />
      </motion.div>
    </>
  )
}

const TASK_MS = 600

/** Checklist shown while setup saves. Items tick in turn; the last waits for the server. */
function Personalizing({ v, templates, existing, finished, fresh, level }: { v: V; templates: Template[]; existing: string[]; finished: boolean; fresh: boolean; level: number }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setN((k) => Math.min(k + 1, 4)), TASK_MS)
    return () => clearInterval(t)
  }, [])
  const ticked = finished ? 5 : n
  const newCount = templates.filter((t) => v.areas.includes(t.area) && v.templates.includes(t.id) && !existing.includes(t.name.toLowerCase())).length
  const nf = new Intl.NumberFormat('en-IN')
  const tasks = [
    { label: 'Saving your profile', hint: `${v.name.trim().split(' ')[0]} · ${v.timezone.split('/').pop()!.replaceAll('_', ' ')} · ${v.baseCurrency.toUpperCase()}` },
    { label: 'Adding your routines', hint: newCount ? `${newCount} new, each with a reminder and a streak` : 'Keeping the ones you already have' },
    { label: 'Setting daily targets', hint: `Sleep ${v.sleepHours}h · ${nf.format(v.steps)} steps${v.areas.includes('health') ? ` · ${(v.waterMl / 1000).toFixed(1).replace('.0', '')} L water` : ''}` },
    { label: 'Tuning your coach', hint: `${v.tone[0].toUpperCase() + v.tone.slice(1)} tone, focused on ${CATEGORY[v.focus ?? v.areas[0]].label}` },
    fresh
      ? { label: 'Starting you at Level 1', hint: 'A fresh start. XP counts from today.' }
      : { label: 'Keeping your progress', hint: `Level ${level}, with your XP and achievements` },
  ]
  return (
    <>
      <Title eyebrow="Almost there" title="Personalizing your ReLife…" body="Setting everything up around your answers. This takes a few seconds." />
      <ol className="flex flex-col gap-1" aria-label="Setup progress">
        {tasks.map((t, k) => {
          const state = k < ticked ? 'done' : k === ticked ? 'now' : 'next'
          return (
            <motion.li key={t.label} variants={item} className={cn('flex items-center gap-3.5 rounded-md py-2.5 transition-[opacity] duration-300', state === 'next' && 'opacity-40')}>
              <span className="relative grid size-6 shrink-0 place-items-center">
                {state === 'now' ? <span aria-hidden className="absolute inset-0 animate-spin rounded-full border-2 border-pill/25 border-t-pill motion-reduce:animate-none" /> : null}
                {state !== 'done' ? <span aria-hidden className={cn('absolute inset-0 rounded-full', state === 'next' && 'shadow-[inset_0_0_0_1.5px_var(--hairline)]')} /> : null}
                <Tick on={state === 'done'} />
              </span>
              <span className="min-w-0">
                <span className={cn('block text-[14.5px] font-medium', state === 'next' ? 'text-ink-3' : 'text-ink')}>{t.label}</span>
                <span className="block truncate text-[12.5px] text-ink-3">{t.hint}</span>
              </span>
              <span className="sr-only">{state === 'done' ? 'done' : state === 'now' ? 'in progress' : 'waiting'}</span>
            </motion.li>
          )
        })}
      </ol>
    </>
  )
}

/** The finish line: a pop-up over everything, with a confetti pop, then on to Today. */
function AllSet({ v, added, level }: { v: V; added: number; level: Level }) {
  const go = useRef<HTMLAnchorElement>(null)
  useEffect(() => { go.current?.focus() }, [])
  const first = v.name.trim().split(' ')[0]
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: EASE_OUT_STRONG }}
      className="fixed inset-0 z-[65] grid place-items-center bg-bg/55 p-5 backdrop-blur-md"
    >
      <Confetti />
      <motion.div
        role="dialog" aria-modal="true" aria-labelledby="all-set-h"
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: 0.5, ease: EASE_OUT_STRONG, delay: 0.05 } }}
        className="relative w-full max-w-[420px] rounded-[28px] bg-surface p-8 text-center shadow-3"
      >
        <div className="flex justify-center"><LevelRing level={level.level} progress={Math.max(0.04, level.progress)} size={128} /></div>
        <p className="mt-6 text-[12px] font-semibold tracking-[0.08em] text-pill-ink uppercase">You’re all set{first ? `, ${first}` : ''}</p>
        <h2 id="all-set-h" className="mt-2 font-display text-[30px] leading-[1.08] font-extrabold tracking-[-0.03em] text-balance text-ink">Level {level.level}. {level.title}.</h2>
        <p className="mx-auto mt-3 max-w-[34ch] text-[14.5px] leading-relaxed text-ink-2">
          {added ? `${added} routine${added === 1 ? '' : 's'} added. ` : ''}Check things off and hit your targets to earn XP and level up.
        </p>
        {/* Concentric: buttons 12px radius inside the 28px card with 16px of breathing room above. */}
        <div className="mt-7 flex flex-col gap-2">
          <a ref={go} href="/" className={buttonClass({ variant: 'primary', size: 'lg', className: 'w-full' })}>
            Go to Today<ArrowRight className="size-4 rtl:-scale-x-100" strokeWidth={2} />
          </a>
          <Link href="/connectors" className={buttonClass({ variant: 'ghost', size: 'lg', className: 'w-full' })}><Cable className="size-4" strokeWidth={1.5} />Connect your data first</Link>
        </div>
      </motion.div>
    </motion.div>
  )
}

const CONFETTI = ['var(--pill)', 'var(--sky)', 'var(--sakura)', 'var(--cat-health)', 'var(--cat-mind)', 'var(--cat-skills)', 'var(--cat-wealth)', 'var(--medal-gold)']

/** Two party poppers firing from the bottom corners. Skipped with reduced motion (petals still fall). */
function Confetti() {
  const reduce = useReducedMotion()
  const bits = useMemo(() => Array.from({ length: 64 }, (_, k) => {
    const left = k % 2 === 0
    const r = (a: number, b: number) => a + Math.random() * (b - a)
    return {
      left, color: CONFETTI[k % CONFETTI.length], round: k % 3 === 0,
      w: r(6, 10), h: r(10, 16), dx: (left ? 1 : -1) * r(120, 620), peak: r(380, 760), fall: r(160, 420),
      spin: r(-540, 540), delay: r(0, 0.18), dur: r(1.7, 2.6),
    }
  }), [])
  if (reduce) return null
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      {bits.map((b, k) => (
        <motion.span
          key={k}
          className="absolute bottom-0"
          style={{ [b.left ? 'left' : 'right']: 0, width: b.w, height: b.round ? b.w : b.h, background: b.color, borderRadius: b.round ? 999 : 2 }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
          animate={{ x: [0, b.dx * 0.8, b.dx], y: [0, -b.peak, -b.peak + b.fall], rotate: b.spin, opacity: [1, 1, 0] }}
          transition={{ duration: b.dur, delay: b.delay, times: [0, 0.4, 1], ease: ['easeOut', 'easeIn'] }}
        />
      ))}
    </div>
  )
}

// Country → currency for the "use this device's currency" hint. Euro countries share EUR.
const EURO = ['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK']
const REGION_CURRENCY: Record<string, string> = {
  IN: 'INR', US: 'USD', GB: 'GBP', JP: 'JPY', SG: 'SGD', AE: 'AED', CA: 'CAD', AU: 'AUD', NZ: 'NZD', CH: 'CHF',
  CN: 'CNY', HK: 'HKD', KR: 'KRW', BR: 'BRL', MX: 'MXN', ZA: 'ZAR', SA: 'SAR', ID: 'IDR', MY: 'MYR', TH: 'THB',
  PH: 'PHP', VN: 'VND', NG: 'NGN', KE: 'KES', PK: 'PKR', BD: 'BDT', LK: 'LKR', NP: 'NPR', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', TR: 'TRY',
  ...Object.fromEntries(EURO.map((c) => [c, 'EUR'])),
}

/** Five segments. Finished ones jump back; later ones can't be skipped to. */
function Progress({ current, onJump }: { current: number; onJump: (k: number) => void }) {
  return (
    <ol aria-label="Setup steps" className="flex gap-1.5">
      {STEPS.map((s, k) => {
        const state = k < current ? 'done' : k === current ? 'now' : 'next'
        return (
          <li key={s} className="flex-1">
            <button
              type="button"
              disabled={state !== 'done'}
              onClick={() => onJump(k)}
              aria-current={state === 'now' ? 'step' : undefined}
              aria-label={`${s}${state === 'done' ? ' (done, go back)' : state === 'now' ? ' (current)' : ''}`}
              className="group flex h-6 w-full items-center rounded-full disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill"
            >
              <span className={cn(
                'h-1.5 w-full rounded-full transition-[background-color,opacity] duration-300 ease-out-quint',
                state === 'next' ? 'bg-ink/10 dark:bg-white/12' : 'bg-pill',
                state === 'done' && 'opacity-60 group-hover:opacity-100',
              )} />
            </button>
          </li>
        )
      })}
    </ol>
  )
}

const greeting = (now: Date, tz: string) => {
  try {
    const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(now))
    return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  } catch { return 'Hello' }
}
const stamp = (now: Date, tz: string) => {
  try { return new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(now) } catch { return '' }
}
const ROW = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: { duration: 0.22, ease: EASE_OUT_STRONG } }

/**
 * Wide screens: a live preview of the Today page, built from the answers so far. The block for the
 * current step is lifted; blocks not reached yet are dimmed placeholders.
 */
function Stage({ v, templates, existing, step, now, level }: { v: V; templates: Template[]; existing: string[]; step: number; now: Date | null; level: number }) {
  const routines = templates
    .filter((t) => v.areas.includes(t.area) && (v.templates.includes(t.id) || existing.includes(t.name.toLowerCase())))
    .sort((a, b) => (a.rule.times?.[0] ?? '').localeCompare(b.rule.times?.[0] ?? ''))
  const focus = v.focus ?? v.areas[0]
  const nf = new Intl.NumberFormat('en-IN')
  const name = v.name.trim().split(' ')[0]

  return (
    <aside
      aria-label="Preview of your Today page"
      className="relative hidden min-h-0 flex-col overflow-hidden rounded-[28px] p-10 shadow-[inset_0_0_0_1px_var(--hairline)] lg:flex"
      style={{ background: 'radial-gradient(120% 80% at 0% 0%, var(--sky-soft), transparent 60%), radial-gradient(90% 70% at 100% 100%, var(--sakura-soft), transparent 65%), var(--surface-2)' }}
    >
      <Wordmark className="h-8 self-start" />

      <div className="my-auto w-full max-w-[400px] self-center py-8">
        {/* Concentric: card 22px = block 14px + 8px padding. */}
        <div className="flex flex-col gap-1 rounded-[22px] bg-surface p-2 shadow-3">
          <Block at={0} step={step}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12.5px] text-ink-3">{now ? greeting(now, v.timezone) : 'Hello'},</p>
                <p className="truncate font-display text-[26px] leading-tight font-extrabold tracking-[-0.02em] text-ink">{name || 'you'}</p>
              </div>
              <span className="mt-1 inline-flex h-6 shrink-0 items-center rounded-full bg-pill-wash px-2.5 text-[11.5px] font-semibold text-pill-ink tabular-nums">Lv {level}</span>
            </div>
            <p className="mt-1 truncate text-[12px] text-ink-3 tabular-nums">{now ? `${stamp(now, v.timezone)} · ` : ' '}{v.baseCurrency.toUpperCase()}</p>
          </Block>

          <Block at={1} step={step} label="Areas">
            <ul className="flex flex-wrap gap-1.5">
              <AnimatePresence initial={false} mode="popLayout">
                {v.areas.map((c) => (
                  <motion.li key={c} layout="position" {...ROW} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-surface px-2.5 text-[12.5px] text-ink-2 shadow-1">
                    <span aria-hidden className="size-2 rounded-full" style={{ background: CATEGORY[c].color }} />
                    {CATEGORY[c].label}
                    {c === focus && v.areas.length > 1 ? <span className="text-[11px] text-ink-3">· focus</span> : null}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </Block>

          <Block at={2} step={step} label="Today" aside={step >= 2 ? <span className="tabular-nums">{routines.length}</span> : null}>
            {step >= 2 ? (
              <ul className="flex flex-col">
                <AnimatePresence initial={false} mode="popLayout">
                  {routines.slice(0, 5).map((t) => (
                    <motion.li key={t.id} layout="position" {...ROW} className="flex h-8 items-center gap-2.5 text-[13px]">
                      <span aria-hidden className="size-3.5 shrink-0 rounded-full" style={{ boxShadow: `inset 0 0 0 1.5px ${CATEGORY[t.area].color}` }} />
                      <span className="min-w-0 flex-1 truncate text-ink">{t.name}</span>
                      <span className="shrink-0 text-[12px] text-ink-3 tabular-nums">{t.rule.times?.[0]}</span>
                    </motion.li>
                  ))}
                </AnimatePresence>
                {routines.length > 5 ? <li className="pt-0.5 text-[12px] text-ink-3 tabular-nums">+{routines.length - 5} more</li> : null}
                {!routines.length ? <li className="text-[12.5px] text-ink-3">Describe your days and the AI builds these.</li> : null}
              </ul>
            ) : <Placeholder rows={3} />}
          </Block>

          <Block at={3} step={step} label="Daily targets" aside={step >= 3 ? <span>{v.tone[0].toUpperCase() + v.tone.slice(1)} tone</span> : null}>
            {step >= 3 ? (
              <dl className="grid grid-cols-3 gap-1.5">
                {[
                  ['Sleep', `${v.sleepHours}h`],
                  ['Steps', nf.format(v.steps)],
                  ...(v.areas.includes('health') ? [['Water', `${(v.waterMl / 1000).toFixed(1).replace('.0', '')} L`]] : []),
                ].map(([k, val]) => (
                  <div key={k} className="rounded-[10px] bg-surface px-2.5 py-2 shadow-1">
                    <dt className="text-[11px] text-ink-3">{k}</dt>
                    <dd className="font-display text-[16px] font-bold text-ink tabular-nums">{val}</dd>
                  </div>
                ))}
              </dl>
            ) : <Placeholder rows={1} tiles />}
          </Block>

          <Block at={4} step={step} label="Why">
            {step >= 4 ? (
              <p className={cn('line-clamp-3 text-[13px] leading-relaxed', v.goals.trim() ? 'text-ink-2' : 'text-ink-3')}>
                {v.goals.trim() ? `“${v.goals.trim()}”` : 'Your goals show here, in your words.'}
              </p>
            ) : <Placeholder rows={2} />}
          </Block>
        </div>
      </div>

      <p className="max-w-[40ch] text-[13px] leading-relaxed text-ink-2">
        {step < STEPS.length
          ? <><span className="font-semibold text-ink">Live preview.</span> Your Today page fills in as you answer. Nothing is saved until you finish.</>
          : <><span className="font-semibold text-ink">Saved.</span> This is your Today page. Change any of it later in Settings or Habits.</>}
      </p>
    </aside>
  )
}

/** One block of the preview. Current step: lifted with a tint. Not reached yet: dimmed. */
function Block({ at, step, label, aside, children }: { at: number; step: number; label?: string; aside?: React.ReactNode; children: React.ReactNode }) {
  const now = at === step
  return (
    <section
      aria-current={now ? 'step' : undefined}
      className={cn(
        'rounded-[14px] p-3.5 transition-[background-color,opacity,box-shadow] duration-300 ease-out-quint',
        now ? 'bg-pill-wash shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--pill)_35%,transparent)]' : 'bg-transparent',
        at > step && 'opacity-45',
      )}
    >
      {label ? (
        <h3 className="mb-2 flex items-center justify-between text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
          {label}{aside ? <span className="font-medium tracking-normal normal-case">{aside}</span> : null}
        </h3>
      ) : null}
      {children}
    </section>
  )
}

function Placeholder({ rows, tiles }: { rows: number; tiles?: boolean }) {
  if (tiles) return <div aria-hidden className="grid grid-cols-3 gap-1.5">{[0, 1, 2].map((k) => <div key={k} className="h-[50px] rounded-[10px] bg-ink/[0.05] dark:bg-white/[0.05]" />)}</div>
  return (
    <div aria-hidden className="flex flex-col gap-2 py-1">
      {Array.from({ length: rows }, (_, k) => <div key={k} className="h-2.5 rounded-full bg-ink/[0.06] dark:bg-white/[0.06]" style={{ width: `${88 - k * 18}%` }} />)}
    </div>
  )
}
