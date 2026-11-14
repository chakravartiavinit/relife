'use client'

import { useEffect, useState } from 'react'
import type { Category } from '@/db/schema'
import type { Template } from '@/core/onboarding'
import type { SuggestedRoutine } from '@/ai/routines'
import { pickSources } from '@/domain/onboarding'
import type { ConnectorItem } from './connector-market'
import type { Pack } from '@relife/contract'
import { Rail } from './onboarding-flow'
import { SaveFile, SaveStrip } from './onboarding-preview'
import type { LocalAiResult } from '@/app/actions'
import { StepAi, StepAreas, StepConnect, StepPack, StepRoutines, StepYou, type Set } from './onboarding-steps'
import { AT, IMPROVE, type V } from './onboarding-data'

// /dev/ui: the four setup steps and the save-file preview from fixtures, each at phone width. Nothing is saved: the
// inline connect on a fixture id fails soft, as in the other galleries.

const AREAS: Category[] = ['health', 'mind', 'skills', 'wealth', 'hobbies']
const IMPROVE_PICKS = ['tracker:sleep.hours', 'tracker:github.commits']
const SIG = JSON.stringify([AREAS, IMPROVE_PICKS])

const FIXTURE: V = {
  name: 'Avinit', timezone: 'Asia/Kolkata', baseCurrency: 'INR', areas: AREAS, focus: undefined, improve: IMPROVE_PICKS,
  wake: '07:00', sleep: '23:30', sleepHours: 7.5, steps: 8000, waterMl: 2500, tone: 'balanced', goals: '', constraints: '',
  templates: [], generated: [], routineMode: null, generatedFor: SIG, starterSeeded: false, sleepTouched: false, pack: null, aiChoice: null,
}

const GENERATED: SuggestedRoutine[] = [
  { id: 'ai-1', area: 'health', name: 'Morning walk', kind: 'routine', rule: { freq: 'daily', times: ['07:30'] }, note: '20 minutes', why: 'You want to walk more and mornings are free.' },
  { id: 'ai-2', area: 'skills', name: 'Deep work block', kind: 'routine', rule: { freq: 'weekly', times: ['10:00'], byweekday: ['MO', 'TU', 'WE', 'TH', 'FR'] }, why: 'Your picks lean to shipping code.' },
  { id: 'ai-3', area: 'mind', name: 'Evening wind-down', kind: 'routine', rule: { freq: 'daily', times: ['22:00'] }, why: 'Helps you sleep on time.' },
]

const base = { section: 'built-in' as const, missingEnv: [], status: 'off' as const, detail: '', description: 'Sample connector.' }
const field = (env: string, label: string, secret = false) => [{ env, label, secret, saved: false, fromEnv: false }]
const SOURCES: ConnectorItem[] = [
  { ...base, id: 'codeforces', name: 'Codeforces', category: 'skills', connected: true, provides: ['Problems solved', 'Rating'], statusLabel: 'first sync starting…', fields: field('CODEFORCES_HANDLE', 'Handle') },
  { ...base, id: 'lichess', name: 'Lichess', category: 'hobbies', connected: false, provides: ['Rating', 'Games'], fields: field('LICHESS_USER', 'Lichess username') },
  { ...base, id: 'icloud-inbox', name: 'iPhone Health', category: 'health', connected: false, provides: ['Steps', 'Sleep', 'Weight'], fields: [] },
  { ...base, id: 'github', name: 'GitHub', category: 'skills', connected: false, provides: ['Commits', 'Pull requests'], fields: field('GITHUB_TOKEN', 'Token', true) },
  { ...base, id: 'swiggy', name: 'Swiggy', category: 'wealth', connected: false, provides: ['Food orders'], login: true, fields: [] },
  { ...base, id: 'telegram', name: 'Telegram', section: 'messaging', connected: false, provides: ['Reminders', 'Quick log'], fields: field('TELEGRAM_BOT_TOKEN', 'Bot token', true) },
]

const SOURCE_NAME: Record<string, string> = { strava: 'Strava', hevy: 'Hevy', oura: 'Oura', whoop: 'WHOOP', swiggy: 'Swiggy', zomato: 'Zomato', amazon: 'Amazon', github: 'GitHub', leetcode: 'LeetCode' }
const NO_AI = { ready: false, model: null }
const provider = (id: string, name: string, secret: boolean): ConnectorItem => ({ ...base, id, name, section: 'ai', connected: false, description: `${name} models.`, provides: [], fields: field(`${id.toUpperCase()}_API_KEY`, 'API key', secret) })
const PROVIDERS: ConnectorItem[] = [provider('anthropic', 'Anthropic', true), provider('openai', 'OpenAI', true), provider('google', 'Google Gemini', true), provider('openrouter', 'OpenRouter', true), provider('local', 'Ollama or LM Studio', false)]
const OK: LocalAiResult = { ok: true, state: 'ok', model: 'qwen3:4b-instruct', url: 'http://localhost:11434/v1', ms: 84 }
const DOWN: LocalAiResult = { ok: true, state: 'down', model: 'qwen3:4b-instruct', url: 'http://localhost:11434/v1', ms: 2500, message: 'Nothing answered at localhost:11434. Install Ollama from ollama.com, then run `ollama pull qwen3:4b-instruct`.' }
const NO_MODEL: LocalAiResult = { ok: true, state: 'no-model', model: 'qwen3:4b-instruct', url: 'http://localhost:11434/v1', ms: 40, message: 'Local AI is running but doesn’t have qwen3:4b-instruct yet. Run `ollama pull qwen3:4b-instruct`.' }

const Frame = ({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) => (
  <div className="min-w-0">
    <p className="mb-2 font-mono text-label text-ink-3 uppercase">{title}</p>
    <div className={`${wide ? 'w-[460px]' : 'w-[390px]'} max-w-full rounded-lg bg-bg p-5 shadow-1`}>{children}</div>
  </div>
)

export function OnboardingGallery({ templates, packs }: { templates: Template[]; packs: Pack[] }) {
  const [v, setV] = useState<V>(FIXTURE)
  // Like setup itself, the steps draw after mount: the region row reads the clock.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const set: Set = (k, val) => setV((s) => ({ ...s, [k]: val }))
  const options = IMPROVE.filter((o) => v.areas.includes(o.area))
  const picks = v.improve.filter((id) => options.some((o) => o.id === id))
  const starters = v.areas.flatMap((c) => templates.filter((t) => t.area === c))
  const rows = pickSources(SOURCES, v.areas)
  const fitness = packs.find((p) => p.id === 'fitness') ?? null
  const none = { set, building: false, setBuilding: () => {}, starters, existing: ['journal'], today: '2026-11-12', picksSig: SIG }
  const aiV: V = { ...v, generated: GENERATED, templates: ['ai-1', 'ai-2'], routineMode: 'ai' }
  if (!mounted) return <div className="h-[640px] animate-pulse rounded-lg bg-surface-2" />
  return (
    <div className="flex flex-col gap-8">
      <div className="max-w-[460px]"><Rail current={3} onJump={() => {}} /></div>
      <div className="flex flex-wrap items-start gap-6">
        <Frame title="1 · You"><StepYou v={v} set={set} suggested={{ tz: 'Asia/Kolkata', cur: 'INR' }} timezones={['Asia/Kolkata', 'Europe/London']} currencies={['INR', 'GBP']} nameError={false} /></Frame>
        <Frame title="1 · You: name missing"><StepYou v={{ ...v, name: '' }} set={set} suggested={null} timezones={['Asia/Kolkata']} currencies={['INR']} nameError /></Frame>
        <Frame title="2 · Pack: Fitness picked"><StepPack v={{ ...v, pack: 'fitness' }} packs={packs} sourceName={(id) => SOURCE_NAME[id]} onPick={() => {}} /></Frame>
        <Frame title="2 · Pack: Custom (the start)"><StepPack v={v} packs={packs} sourceName={(id) => SOURCE_NAME[id]} onPick={() => {}} /></Frame>
        <Frame title="3 · Areas (up to three to train)"><StepAreas v={v} set={set} picks={picks} options={options} onRefuse={() => {}} /></Frame>
        <Frame title="4 · Connect: one connected, a username field, a dialog, a sign-in later"><StepConnect rows={rows} /></Frame>
        <Frame title="5 · AI: free local AI ready"><StepAi v={v} set={set} ai={NO_AI} providers={PROVIDERS} local={OK} checking={false} onCheck={() => {}} /></Frame>
        <Frame title="5 · AI: checking"><StepAi v={v} set={set} ai={NO_AI} providers={PROVIDERS} local={null} checking onCheck={() => {}} /></Frame>
        <Frame title="5 · AI: Ollama not reachable"><StepAi v={v} set={set} ai={NO_AI} providers={PROVIDERS} local={DOWN} checking={false} onCheck={() => {}} /></Frame>
        <Frame title="5 · AI: running without the model"><StepAi v={v} set={set} ai={NO_AI} providers={PROVIDERS} local={NO_MODEL} checking={false} onCheck={() => {}} /></Frame>
        <Frame title="5 · AI: cloud key"><StepAi v={{ ...v, aiChoice: 'cloud' }} set={set} ai={NO_AI} providers={PROVIDERS} local={OK} checking={false} onCheck={() => {}} /></Frame>
        <Frame title="5 · AI: skip"><StepAi v={{ ...v, aiChoice: 'skip' }} set={set} ai={NO_AI} providers={PROVIDERS} local={OK} checking={false} onCheck={() => {}} /></Frame>
        <Frame title="5 · AI: a model is already connected"><StepAi v={v} set={set} ai={{ ready: true, model: 'anthropic:claude-sonnet-5-5' }} providers={PROVIDERS} local={null} checking={false} onCheck={() => {}} /></Frame>
        <Frame title="6 · Routines: starter list (no model)"><StepRoutines {...none} v={v} mode="starter" kind="starter" ai={{ ready: false, model: null }} /></Frame>
        <Frame title="6 · Routines: model suggestions"><StepRoutines {...none} v={aiV} mode="ai" kind="ai" ai={{ ready: true, model: 'local:fake' }} /></Frame>
        <Frame title="6 · Routines: the model is thinking"><StepRoutines {...none} v={{ ...v, starterSeeded: true }} mode="ai" kind="ai" building ai={{ ready: true, model: 'local:fake' }} /></Frame>
      </div>
      <div className="flex flex-wrap items-start gap-6">
        <Frame title="Save file, step 4, Fitness pack (desktop right half)" wide>
          <SaveFile v={{ ...v, pack: 'fitness', templates: ['water', 'workout'] }} step={AT.ai} picks={picks} routines={['water', 'workout']} starters={starters} sources={rows} pack={fitness} ai={{ choice: 'local', connected: null, local: OK }} />
        </Frame>
        <Frame title="Save file, step 4, Custom, local AI not answering" wide>
          <SaveFile v={{ ...v, templates: ['water', 'workout'] }} step={AT.ai} picks={picks} routines={['water', 'workout']} starters={starters} sources={rows} pack={null} ai={{ choice: 'local', connected: null, local: DOWN }} />
        </Frame>
        <Frame title="Save strip (phone)"><SaveStrip v={v} /></Frame>
      </div>
    </div>
  )
}
