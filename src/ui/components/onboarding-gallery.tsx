'use client'

import { useEffect, useState } from 'react'
import type { Category } from '@/db/schema'
import type { Template } from '@/core/onboarding'
import type { SuggestedRoutine } from '@/ai/routines'
import { pickSources } from '@/domain/onboarding'
import type { ConnectorItem } from './connector-market'
import { Rail } from './onboarding-flow'
import { SaveFile, SaveStrip } from './onboarding-preview'
import { StepAreas, StepConnect, StepRoutines, StepYou, type Set } from './onboarding-steps'
import { IMPROVE, type V } from './onboarding-data'

// /dev/ui: the four setup steps and the save-file preview from fixtures, each at phone width. Nothing is saved: the
// inline connect on a fixture id fails soft, as in the other galleries.

const AREAS: Category[] = ['health', 'mind', 'skills', 'wealth', 'hobbies']
const IMPROVE_PICKS = ['tracker:sleep.hours', 'tracker:github.commits']
const SIG = JSON.stringify([AREAS, IMPROVE_PICKS])

const FIXTURE: V = {
  name: 'Avinit', timezone: 'Asia/Kolkata', baseCurrency: 'INR', areas: AREAS, focus: undefined, improve: IMPROVE_PICKS,
  wake: '07:00', sleep: '23:30', sleepHours: 7.5, steps: 8000, waterMl: 2500, tone: 'balanced', goals: '', constraints: '',
  templates: [], generated: [], routineMode: null, generatedFor: SIG, starterSeeded: false, sleepTouched: false,
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

const Frame = ({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) => (
  <div className="min-w-0">
    <p className="mb-2 font-mono text-label text-ink-3 uppercase">{title}</p>
    <div className={`${wide ? 'w-[460px]' : 'w-[390px]'} max-w-full rounded-lg bg-bg p-5 shadow-1`}>{children}</div>
  </div>
)

export function OnboardingGallery({ templates }: { templates: Template[] }) {
  const [v, setV] = useState<V>(FIXTURE)
  // Like setup itself, the steps draw after mount: the region row reads the clock.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const set: Set = (k, val) => setV((s) => ({ ...s, [k]: val }))
  const options = IMPROVE.filter((o) => v.areas.includes(o.area))
  const picks = v.improve.filter((id) => options.some((o) => o.id === id))
  const starters = v.areas.flatMap((c) => templates.filter((t) => t.area === c))
  const rows = pickSources(SOURCES, v.areas)
  const none = { set, building: false, setBuilding: () => {}, starters, existing: ['journal'], today: '2026-11-12', picksSig: SIG }
  const aiV: V = { ...v, generated: GENERATED, templates: ['ai-1', 'ai-2'], routineMode: 'ai' }
  if (!mounted) return <div className="h-[640px] animate-pulse rounded-lg bg-surface-2" />
  return (
    <div className="flex flex-col gap-8">
      <div className="max-w-[460px]"><Rail current={2} onJump={() => {}} /></div>
      <div className="flex flex-wrap items-start gap-6">
        <Frame title="1 · You"><StepYou v={v} set={set} suggested={{ tz: 'Asia/Kolkata', cur: 'INR' }} timezones={['Asia/Kolkata', 'Europe/London']} currencies={['INR', 'GBP']} nameError={false} /></Frame>
        <Frame title="1 · You: name missing"><StepYou v={{ ...v, name: '' }} set={set} suggested={null} timezones={['Asia/Kolkata']} currencies={['INR']} nameError /></Frame>
        <Frame title="2 · Areas (up to three to train)"><StepAreas v={v} set={set} picks={picks} options={options} onRefuse={() => {}} /></Frame>
        <Frame title="3 · Connect: one connected, a username field, a dialog, a sign-in later"><StepConnect rows={rows} /></Frame>
        <Frame title="4 · Routines: starter list (no model)"><StepRoutines {...none} v={v} mode="starter" kind="starter" ai={{ ready: false, model: null }} /></Frame>
        <Frame title="4 · Routines: model suggestions"><StepRoutines {...none} v={aiV} mode="ai" kind="ai" ai={{ ready: true, model: 'local:fake' }} /></Frame>
        <Frame title="4 · Routines: the model is thinking"><StepRoutines {...none} v={{ ...v, starterSeeded: true }} mode="ai" kind="ai" building ai={{ ready: true, model: 'local:fake' }} /></Frame>
      </div>
      <div className="flex flex-wrap items-start gap-6">
        <Frame title="Save file, step 3 (desktop right half)" wide>
          <SaveFile v={{ ...v, templates: ['water', 'workout'] }} step={3} picks={picks} routines={['water', 'workout']} starters={starters} sources={rows} />
        </Frame>
        <Frame title="Save strip (phone)"><SaveStrip v={v} /></Frame>
      </div>
    </div>
  )
}
