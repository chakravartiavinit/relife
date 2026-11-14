'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { ArrowLeft, ArrowRight, Check, CornerDownLeft, LoaderCircle } from 'lucide-react'
import type { Pack } from '@relife/contract'
import type { Category } from '@/db/schema'
import type { Template } from '@/core/onboarding'
import { pickSources } from '@/domain/onboarding'
import { applyPack } from '@/domain/packs'
import { aiReady, checkLocalAi, chooseLocalAi, finishOnboarding, skipOnboardingAction, type LocalAiResult } from '@/app/actions'
import { Button } from './button'
import { Wordmark } from './logo'
import { ThemeToggle } from './theme-toggle'
import type { ConnectorItem } from './connector-market'
import { Backdrop, SaveFile, SaveStrip } from './onboarding-preview'
import { StepAi, StepAreas, StepConnect, StepPack, StepRoutines, StepYou, type Ai, type Set } from './onboarding-steps'
import { FOCUS, SWAP, stepMotion } from './onboarding-ui'
import { AT, IMPROVE, LAST, MAX_IMPROVE, STEPS, canonTz, clamp, type Initial, type V } from './onboarding-data'
import { cn } from '../cn'
import { CATEGORY } from '../tokens'
import { EASE_OUT } from '@/ui/beui/lib/ease'

const AREAS_STEP = STEPS.findIndex((s) => s.key === 'areas')
const ALL_AREAS = Object.keys(CATEGORY) as Category[]

// One-time setup, as a split screen. On the left, one short group of questions at a time: six steps (You, Pack,
// Areas, Connect, AI, Routines), each filled in already so Enter walks straight through (Pack starts on Custom). On the right, the player's
// save file builds itself from the answers (onboarding-preview.tsx), so every choice shows what it changes. On a
// phone the preview shrinks to one line above the questions. Answers survive a reload until setup is finished.
// Finishing lands on Today, where the first-day card carries what is left to set up.
// The questions are in onboarding-steps.tsx; their shared look is in onboarding-ui.tsx.

const DRAFT = 'relife:setup-draft:v3'

export function OnboardingFlow({ initial, templates, existing, timezones, currencies, today, fresh, sources, packs, providers }: {
  initial: Initial; templates: Template[]; existing: string[]; timezones: string[]; currencies: string[]; today: string
  /** First time through (finishing clears earlier XP for a fresh start at Level 1): start from this device's time zone. */
  fresh: boolean
  /** Every data source and Telegram, as Connections shows them. The Connect step picks a few for the chosen areas. */
  sources: ConnectorItem[]
  /** The starter packs the Pack step offers. */
  packs: Pack[]
  /** The AI providers (cloud keys and the local server), as Connections shows them. */
  providers: ConnectorItem[]
}) {
  // The areas the Areas step opens with. Saved ones; none saved means every area shows, which a rerun keeps rather than
  // narrowing to a starting three. Only a first setup starts from the three.
  const arrivalAreas = initial.areas.length ? initial.areas : fresh ? (['health', 'mind', 'skills'] as Category[]) : ALL_AREAS
  const [i, setI] = useState(0)
  // Past the Areas step at least once: only then does setup save the area picks (Skip before it keeps every area).
  const [pastAreas, setPastAreas] = useState(false)
  const [dir, setDir] = useState(1)
  const [v, setV] = useState<V>({
    ...initial,
    areas: arrivalAreas,
    // The routine lists decide on arrival at the last step.
    templates: [], generated: [], routineMode: null, generatedFor: '', starterSeeded: false, sleepTouched: false, pack: null, aiChoice: null,
  })
  const [error, setError] = useState<string | null>(null)
  const [nudge, setNudge] = useState(0) // bumps when a fourth training pick is refused, to shake the line
  const [pending, start] = useTransition()
  // After a save the page is leaving for Today: keep the button busy until it does.
  const [leaving, setLeaving] = useState(false)
  const pane = useRef<HTMLDivElement>(null)
  const [ai, setAi] = useState<Ai | null>(null)
  // Asked again when a provider connects (the cloud key dialog on the AI step refreshes `providers`).
  const connectedKey = providers.map((p) => `${p.id}:${p.connected}`).join()
  // Until it answers (`ai === null`) Continue on the AI step waits; a failed call counts as no model.
  const askAi = () => aiReady().then(setAi).catch(() => setAi({ ready: false, model: null }))
  useEffect(() => { void askAi() }, [connectedKey]) // eslint-disable-line react-hooks/exhaustive-deps -- askAi only sets state
  // The free local AI: checked when its card is showing, saved on Continue.
  const [local, setLocal] = useState<LocalAiResult | null>(null)
  const [checking, setChecking] = useState(false)
  // A local model chosen before (an earlier setup, Connections or .env) whose server isn't answering: setup never swaps it.
  const keptLocal = !!ai && !ai.ready && !!ai.model?.startsWith('local:')
  const runCheck = () => {
    setChecking(true)
    checkLocalAi().catch(() => ({ ok: false as const, error: 'Couldn’t check for Ollama. Try again.' })).then(setLocal).finally(() => setChecking(false))
  }

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
      if (draft.i > AREAS_STEP) setPastAreas(true)
    } else if (fresh && canonTz(tz)) {
      // Only when it really is another zone: browsers call Asia/Kolkata by its old name, Asia/Calcutta.
      setV((s) => (canonTz(s.timezone) === canonTz(tz) ? s : { ...s, timezone: tz }))
    }
    setReady(true)
  }, [fresh, base])
  useEffect(() => {
    if (ready && !leaving) sessionStorage.setItem(DRAFT, JSON.stringify({ v, i, base }))
  }, [ready, leaving, v, i, base])

  const set: Set = (k, val) => { setV((s) => ({ ...s, [k]: val })); setError(null); setNudge(0) }
  const options = IMPROVE.filter((o) => v.areas.includes(o.area))
  const picks = v.improve.filter((id) => options.some((o) => o.id === id))
  const mode = v.routineMode ?? (ai?.ready ? 'ai' : 'starter')
  const starters = v.areas.flatMap((c) => templates.filter((t) => t.area === c))
  // What the model's list was built from: changing areas or picks on an earlier step builds it again.
  const picksSig = JSON.stringify([v.areas, picks])
  // If the model was asked and gave nothing (it failed or came back empty), the starter list stands in for it.
  const [building, setBuilding] = useState(false)
  const failed = mode === 'ai' && !!ai?.ready && !building && v.generatedFor === picksSig && !v.generated.length
  const kind = mode === 'ai' && !!ai?.ready && !failed ? 'ai' : 'starter'
  // Each routine list keeps its own ticks; only the list on screen is created.
  const routines = v.templates.filter((id) => (kind === 'ai') === id.startsWith('ai-'))

  // The rows on Connect are chosen from how things stood on arrival and stay put while a source connects (its row
  // flips to a check in place); each row then reads the live state.
  const [first] = useState(() => sources.filter((c) => !c.unavailable))
  const pack = packs.find((p) => p.id === v.pack) ?? null
  const order = useMemo(() => pickSources(first, v.areas, undefined, pack?.sources ?? []).map((c) => c.id), [first, v.areas, pack])
  const rows = order.flatMap((id) => sources.find((c) => c.id === id) ?? [])
  const connected = rows.filter((c) => c.connected).length

  const check = (): string | null => {
    if (i === AT.you && !v.name.trim()) return 'Type your name to continue'
    if (i === AT.you && !canonTz(v.timezone)) return 'Pick a time zone from the list'
    if (i === AT.you && !currencies.includes(v.baseCurrency.toUpperCase())) return 'Pick a currency from the list'
    if (i === AT.areas && !v.areas.length) return 'Pick at least one area'
    return null
  }
  // The button looks unavailable until the step has its answer; pressing it anyway says what's missing.
  const valid = !check()
  const to = (k: number) => {
    setDir(k > i ? 1 : -1); setI(k); setError(null); setNudge(0)
    if (k > AREAS_STEP) setPastAreas(true)
    pane.current?.scrollTo({ top: 0 })
  }
  // What setup writes. Running it again sends a setting only when it was changed here, so nothing is overwritten by accident.
  const answers = (full: boolean) => {
    const changed = <K extends 'sleepHours' | 'steps'>(k: K) => (full && (fresh || v[k] !== initial[k]) ? v[k] : undefined)
    const hours = full && (fresh || v.wake !== initial.wake || v.sleep !== initial.sleep)
    return {
      name: v.name, timezone: v.timezone, baseCurrency: v.baseCurrency.toUpperCase(),
      // Run again, the saved areas are sent only when they were changed here (a pack adds to them; unchanged is not a write).
      areas: fresh ? (full || pastAreas ? v.areas : initial.areas.length ? initial.areas : ALL_AREAS)
        : (full || pastAreas) && (v.areas.length !== arrivalAreas.length || v.areas.some((a) => !arrivalAreas.includes(a))) ? v.areas : undefined,
      focus: v.focus && v.areas.includes(v.focus) ? v.focus : undefined, improve: picks,
      wake: hours ? v.wake : undefined, sleep: hours ? v.sleep : undefined,
      sleepHours: changed('sleepHours'), steps: changed('steps'), waterMl: full ? v.waterMl : undefined,
      templates: full ? routines : [], generated: full ? v.generated : [],
      pack: full && v.pack ? v.pack : undefined,
    }
  }
  const finish = (full: boolean) => start(async () => {
    const r = await finishOnboarding(answers(full))
    if (!r.ok) return setError(r.error)
    sessionStorage.removeItem(DRAFT)
    setLeaving(true)
    window.location.assign('/')
  })
  const next = () => {
    const e = check()
    if (e) return setError(e)
    if (i === AT.ai && !ai) return // still asking whether a model is connected
    // Free local AI is saved on the way out of the AI step when it was clicked, or when the check found Ollama. Walking
    // through with Enter while nothing answers saves nothing, and a model that is already chosen is never replaced.
    const saveLocal = !ai?.ready && !keptLocal && !ai?.model && (v.aiChoice === 'local' || (v.aiChoice === null && !!local?.ok && local.state !== 'down'))
    if (i === AT.ai && saveLocal) {
      return start(async () => {
        const r = await chooseLocalAi().catch(() => ({ ok: false as const, error: 'Couldn’t save that. Try again.' }))
        if (!r.ok) return setError(r.error)
        setLocal(r)
        await askAi()
        to(i + 1)
      })
    }
    if (i < LAST) return to(i + 1)
    finish(true)
  }
  // First sight of the AI step with free local AI showing: look for the server.
  useEffect(() => {
    if (i === AT.ai && ready && ai && !ai.ready && !keptLocal && (v.aiChoice ?? 'local') === 'local' && !local && !checking) runCheck()
  }) // eslint-disable-line react-hooks/exhaustive-deps -- runs while the AI step shows and no answer is in yet
  // Skip saves what is filled in so far (a name and region), then lands on Today with the checklist. Without a name
  // there is nothing to save. Running setup again from Settings just goes back.
  const skip = () => {
    if (!fresh) { sessionStorage.removeItem(DRAFT); window.location.assign('/'); return }
    const filled = v.name.trim() && canonTz(v.timezone) && currencies.includes(v.baseCurrency.toUpperCase())
    if (filled) return finish(false)
    start(async () => { sessionStorage.removeItem(DRAFT); await skipOnboardingAction(); window.location.assign('/') })
  }

  // Enter continues, like any form, except in multi-line fields and the inline connect forms, which submit
  // themselves. (A focused button keeps Enter for itself; the pickers stop it.) Finishing takes a click.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.shiftKey || e.defaultPrevented || pending || leaving || i === LAST) return
      const el = e.target as HTMLElement
      if (el.tagName === 'BUTTON' || el.tagName === 'TEXTAREA' || el.tagName === 'A' || el.closest('form')) return
      e.preventDefault(); next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // One line beside the action: what's missing, a count, or a note.
  const refused = i === AT.areas && nudge > 0
  const aiChoice = v.aiChoice ?? 'local'
  const aiDown = i === AT.ai && (keptLocal || (!ai?.ready && aiChoice === 'local' && !checking && !!local?.ok && local.state !== 'ok'))
  const line = error
    ?? (i === AT.you ? 'You can change all of this later in Settings.'
      : i === AT.pack ? (pack ? `${pack.name} · ${pack.routines.length} routines, ${pack.goals.length} goal${pack.goals.length === 1 ? '' : 's'}` : 'Custom · you choose everything')
      : i === AT.ai ? (keptLocal ? 'Local AI not running. It stays your model; nothing changes if you continue.' : ai?.ready ? 'A model is connected' : aiChoice === 'skip' ? 'No model. Add one any time in You › Connections.' : aiChoice === 'cloud' ? 'Paste a key above, or continue and add one later.'
        : checking || !local ? 'Looking for Ollama…' : aiDown ? 'Local AI not running. Continue and it stays off until it does.' : 'Local AI is ready · nothing leaves this machine')
      : i === AT.areas ? (refused ? 'Up to three. Drop one to swap.' : `${v.areas.length} area${v.areas.length === 1 ? '' : 's'} · ${picks.length} of ${MAX_IMPROVE} to train`)
      : i === AT.connect ? `${connected} connected. More any time in You › Connections.`
      : routines.length ? `${routines.length} routine${routines.length === 1 ? '' : 's'} on` : 'None on. Add routines anytime in Plan.')
  const busy = pending || leaving

  return (
    <div className="fixed inset-0 z-[60] grid bg-bg lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* ── Questions ── */}
      {/* The scrollbar's room is kept on every step, so a long step doesn't push the column sideways. */}
      <div ref={pane} data-onboarding-scroll className="relative flex min-h-0 flex-col overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 bg-bg/85 px-5 pt-[env(safe-area-inset-top)] backdrop-blur-md sm:px-10">
          <Wordmark className="h-6" />
          <span className="flex items-center gap-1">
            <ThemeToggle />
            <button type="button" onClick={skip} disabled={busy}
              className={cn('-me-3 h-10 rounded-md px-3 text-body font-medium text-ink-3 transition-[color,scale] duration-150 ease-out-quint hover:text-ink active:scale-[0.96] disabled:opacity-50', FOCUS)}>
              Skip for now
            </button>
          </span>
        </header>

        <main className="mx-auto flex w-full max-w-[540px] flex-1 flex-col px-5 pb-10 sm:px-10">
          <Rail current={i} onJump={(k) => { if (!busy && k < i) to(k) }} />
          <div className="mt-5 lg:hidden"><SaveStrip v={v} /></div>

          <div className="relative mt-8 flex-1 short:mt-6 lg:mt-12">
            <AnimatePresence mode="popLayout" custom={dir} initial={false}>
              {ready ? (
                <motion.section key={i} custom={dir} variants={stepMotion} initial="enter" animate="center" exit="exit" aria-live="polite">
                  {i === AT.you ? <StepYou v={v} set={set} suggested={device} timezones={timezones} currencies={currencies} nameError={!!error && !v.name.trim()} />
                    : i === AT.pack ? <StepPack v={v} packs={packs} sourceName={(id) => sources.find((c) => c.id === id)?.name} onPick={(id) => { if (id === v.pack) return; setV((s) => applyPack(s, packs.find((p) => p.id === id) ?? null, fresh ? [] : arrivalAreas)); setError(null) }} />
                    : i === AT.areas ? <StepAreas v={v} set={set} picks={picks} options={options} onRefuse={() => setNudge((n) => n + 1)} />
                    : i === AT.connect ? <StepConnect rows={rows} />
                    : i === AT.ai ? <StepAi v={v} set={set} ai={ai} providers={providers} local={local} checking={checking} onCheck={runCheck} onRecheck={() => void askAi()} />
                    : <StepRoutines v={v} set={set} mode={mode} kind={kind} building={building} setBuilding={setBuilding} starters={starters} existing={existing} today={today} ai={ai} picksSig={picksSig} />}
                </motion.section>
              ) : null}
            </AnimatePresence>
          </div>
        </main>

        {/* The action bar: back, one quiet line, and the one action, in the same place on every step. */}
        <footer className="sticky bottom-0 z-20 shrink-0 border-t border-divider bg-bg/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-[540px] items-center gap-3 px-5 py-4 sm:px-10">
            <AnimatePresence initial={false} mode="popLayout">
              {i > 0 ? (
                <motion.span key="back" className="inline-flex" {...SWAP}>
                  <Button variant="secondary" size="icon" aria-label="Back" onClick={() => to(i - 1)} disabled={busy} className="size-10">
                    <ArrowLeft className="size-4 rtl:-scale-x-100" strokeWidth={2} />
                  </Button>
                </motion.span>
              ) : null}
            </AnimatePresence>
            {/* A refused pick shakes the line once. */}
            <motion.p key={nudge} role={error ? 'alert' : undefined} aria-live="polite"
              initial={false} animate={refused ? { x: [0, -5, 5, -3, 3, 0] } : { x: 0 }} transition={{ duration: 0.3, ease: EASE_OUT }}
              className={cn('min-w-0 flex-1 text-caption text-pretty tabular-nums', error || refused ? 'font-medium text-bad' : aiDown ? 'font-medium text-warn' : 'text-ink-3 max-sm:flex-none')}>
              {/* On a phone only what's missing shows, so the bar stays one row. */}
              <span className={cn(!(error || refused || aiDown) && 'max-sm:sr-only')}>{line}</span>
            </motion.p>
            <Button variant="primary" size="lg" onClick={next} disabled={busy || (i === AT.ai && !ai)} aria-disabled={!valid} aria-busy={busy}
              className={cn('h-10 min-w-[132px] text-body aria-disabled:opacity-50', !(error || refused || aiDown) && 'max-sm:flex-1')}>
              {busy ? <><LoaderCircle className="size-4 animate-spin [animation-duration:0.7s]" aria-hidden />{leaving ? 'Opening Today…' : 'Saving…'}</>
                : i < LAST ? <>Continue<kbd aria-hidden className="ms-0.5 grid h-5 place-items-center rounded-[5px] bg-white/15 px-1 font-sans text-label max-sm:hidden dark:bg-black/10"><CornerDownLeft className="size-3" strokeWidth={2} /></kbd></>
                : <>Start Level 1<ArrowRight className="size-4 rtl:-scale-x-100" strokeWidth={2} /></>}
            </Button>
          </div>
        </footer>
      </div>

      {/* ── The save file, building itself ── */}
      <aside aria-label="Preview of your save file" className="relative hidden min-h-0 p-3 ps-0 lg:block">
        <div className="relative isolate h-full overflow-hidden rounded-[28px] bg-surface-2 shadow-inset">
          <Backdrop progress={i / LAST} areas={v.areas} />
          <div className="relative flex h-full flex-col items-center overflow-y-auto px-8 py-10 [scrollbar-width:none]">
            <div className="my-auto flex w-full justify-center">
              <SaveFile v={v} step={i} picks={picks} routines={routines} starters={starters} sources={rows} pack={pack} ai={{ choice: keptLocal ? 'local' : v.aiChoice ?? (ai?.ready ? null : 'local'), connected: ai?.ready ? ai.model : null, local: keptLocal ? { ok: true, state: ai?.local?.state === 'no-model' ? 'no-model' : 'down', model: ai!.model!.slice('local:'.length), url: '', ms: 0 } : local }} />
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}

/** The six steps as labelled capsules. Finished ones jump back. */
export function Rail({ current, onJump }: { current: number; onJump: (k: number) => void }) {
  return (
    <ol aria-label="Setup steps" className="grid grid-cols-6 gap-1.5">
      {STEPS.map((s, k) => {
        const state = k < current ? 'done' : k === current ? 'now' : 'next'
        return (
          <li key={s.key} className="min-w-0">
            <button type="button" disabled={state !== 'done'} onClick={() => onJump(k)}
              aria-current={state === 'now' ? 'step' : undefined}
              aria-label={`Step ${k + 1} of ${STEPS.length}: ${s.label}${state === 'done' ? ' (done, go back)' : state === 'now' ? ' (current)' : ''}`}
              className="group flex w-full min-w-0 flex-col gap-2 rounded-md pt-2 pb-1 text-start disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill">
              <span className="relative block h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.08] dark:bg-white/[0.1]">
                {/* Slides instead of scaling, so the round end stays round. */}
                <span className={cn(
                  'absolute inset-0 rounded-full transition-[translate,background-color,opacity] duration-300 ease-[var(--ease-out-strong)] motion-reduce:transition-none group-enabled:group-hover:opacity-60',
                  // Every step reached is capsule blue, as drawn; the one you are on is also bold below.
                  state === 'next' ? '-translate-x-[101%]' : 'translate-x-0', 'bg-pill',
                )} />
              </span>
              <span className={cn('flex min-w-0 items-center gap-1 text-caption transition-[color] duration-150',
                state === 'now' ? 'font-semibold text-ink' : state === 'done' ? 'text-ink-2 group-hover:text-ink' : 'text-ink-3')}>
                {state === 'done' ? <Check aria-hidden className="size-3 shrink-0" strokeWidth={2.5} /> : null}
                <span className="truncate">{s.label}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ol>
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
