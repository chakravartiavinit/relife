'use client'

import { useState } from 'react'
import { LayoutTemplate } from 'lucide-react'
import { BUILT_IN_PACKS } from '@/packs'
import type { Category } from '@/db/schema'
import { countsLine, planPack, type PackState } from '@/domain/packs'
import { packErrorText } from '@/domain/pack-source'
import { TemplatesButton } from './templates-button'
import { ExportView, PackPreviewView, TemplatesHome, type ExportViewProps, type PreviewViewProps, type TemplatesHomeProps } from './templates-view'

// /dev/ui: the Templates window in each state, drawn from fixtures (made-up people and packs, nothing from a database).

const noop = () => {}
const fitness = BUILT_IN_PACKS.find((p) => p.id === 'fitness')!
const money = BUILT_IN_PACKS.find((p) => p.id === 'money')!
const TODAY = '2026-11-14'
const empty: PackState = { routineNames: new Set(), routineIds: new Map(), trackers: new Map(), goalTitles: new Set(), activeGoals: 0, areas: [] }
const cards = BUILT_IN_PACKS.map((p) => ({ id: p.id, name: p.name, description: p.description, areas: p.areas as Category[], counts: countsLine(p) }))

const home = (over: Partial<TemplatesHomeProps> = {}): TemplatesHomeProps => ({
  builtIn: cards, community: { state: 'idle', items: [] }, link: '', busy: null,
  onOpenBuiltIn: noop, onOpenCommunity: noop, onFile: noop, onLink: noop, onOpenLink: noop, onLoadCommunity: noop, onShare: noop, ...over,
})

const preview = (over: Partial<PreviewViewProps> = {}): PreviewViewProps => {
  const plan = planPack(fitness, empty, TODAY)
  return {
    pack: fitness, plan, selected: { routines: plan.routines.map((r) => r.key), trackers: [], goals: plan.goals.map((g) => g.key) },
    recorded: { 'active-days': null }, typed: {}, addAreas: true, offAreas: [], count: 4, waiting: ['Walk 8,000 steps on five days a week'],
    onToggle: noop, onTyped: noop, onAddAreas: noop, onBack: noop, onApply: noop, ...over,
  }
}

const choices = {
  routines: [{ id: 'r1', name: 'Morning stretch', area: 'health' as const }, { id: 'r2', name: 'Read a few pages', area: 'mind' as const }, { id: 'r3', name: 'Weekly review', area: 'skills' as const }],
  trackers: [{ id: 't1', name: 'Steps', area: 'health' as const }],
  goals: [{ id: 'g1', name: 'Walk 8,000 steps on five days a week', area: 'health' as const }],
}
const exp = (over: Partial<ExportViewProps> = {}): ExportViewProps => ({
  state: 'ready', choices, selected: { routines: ['r1', 'r2'], trackers: [], goals: [] }, form: { name: 'My setup', description: 'The routines I keep on a normal week.', author: '', includeNotes: false },
  onToggle: noop, onForm: noop, onBack: noop, onRetry: noop, onDownload: noop, ...over,
})

function Panel({ name, title, children }: { name: string; title: string; children: React.ReactNode }) {
  return (
    <div data-panel={name} className="min-w-0">
      <p className="mb-2 font-mono text-label text-ink-3 uppercase">{title}</p>
      <div className="w-[640px] max-w-full rounded-xl bg-surface px-6 pt-5 pb-6 shadow-3">
        <header className="mb-4 flex items-start gap-3">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-pill-wash text-pill-ink"><LayoutTemplate className="size-5" strokeWidth={2} /></span>
          <div className="min-w-0">
            <h2 className="font-display text-title text-ink">Templates</h2>
            <p className="mt-1 text-small text-ink-3">Routines, trackers and goals that someone already worked out. You choose what to add.</p>
          </div>
        </header>
        {children}
      </div>
    </div>
  )
}

export function TemplatesGallery() {
  const [typed, setTyped] = useState<Record<string, string>>({})
  const [link, setLink] = useState('')
  const n = Number(typed['active-days'])
  const ready = typed['active-days']?.trim() && Number.isFinite(n)
  const moneyPlan = planPack(money, { ...empty, areas: ['health'] }, TODAY, { addAreas: true })
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-3">
        <TemplatesButton />
        <TemplatesButton locked="Demo: changes are off" />
        <span className="text-caption text-ink-3">The real button (opens the live dialog) and the locked one, as in the read-only demo.</span>
      </div>
      <div data-gallery="sources" className="flex flex-wrap items-start gap-6">
        <Panel name="home-sources" title="Home: the four sources (live: type a link)"><TemplatesHome {...home({ link, onLink: setLink })} /></Panel>
        <Panel name="home-community" title="Home: community packs loaded"><TemplatesHome {...home({ community: { state: 'ready', items: [
          { id: 'sleep-wind-down', name: 'Sleep wind-down', description: 'A calm last hour of the day: screens off, a short reading slot and a lights-out reminder.', author: 'A community member', areas: ['health', 'mind'] },
          { id: 'weekly-reset', name: 'Weekly reset', description: 'One calm hour on Sunday to look at the week behind and set up the week ahead.', areas: ['mind', 'skills'] },
        ] } })} /></Panel>
        <Panel name="home-community-states" title="Home: community list loading, then failed"><div className="flex flex-col gap-6">
          <TemplatesHome {...home({ builtIn: [], community: { state: 'loading', items: [] } })} />
          <TemplatesHome {...home({ builtIn: [], community: { state: 'error', items: [], error: 'That link could not be opened. Check it, or download the file and choose it instead.' } })} />
        </div></Panel>
        <Panel name="home-failures" title="Home: opening a pack, and the three ways it can fail"><div className="flex flex-col gap-6">
          <TemplatesHome {...home({ builtIn: cards.slice(0, 1), community: { state: 'idle', items: [] }, busy: 'fitness' })} />
          <TemplatesHome {...home({ builtIn: [], link: 'https://example.com/pack.json', error: { where: 'link', message: 'That link could not be opened. Check it, or download the file and choose it instead.' } })} />
          <TemplatesHome {...home({ builtIn: [], error: { where: 'file', message: 'This is not a pack file (not valid JSON).' } })} />
          <TemplatesHome {...home({ builtIn: [], error: { where: 'file', message: packErrorText('Made by a newer version') } })} />
        </div></Panel>
      </div>
      <div data-gallery="preview" className="flex flex-wrap items-start gap-6">
        <Panel name="preview-new" title="Preview: a new user, the goal waits for a number (live)">
          <PackPreviewView {...preview({ typed, count: ready ? 5 : 4, waiting: ready ? [] : preview().waiting, onTyped: (k, v) => setTyped((t) => ({ ...t, [k]: v })) })} />
        </Panel>
        <Panel name="preview-again" title="Preview: running it again, everything is already there">
          <PackPreviewView {...(() => {
            const state: PackState = { ...empty, routineNames: new Set(fitness.routines.map((r) => r.name.toLowerCase())), goalTitles: new Set(fitness.goals.map((g) => g.title.toLowerCase())) }
            return preview({ plan: planPack(fitness, state, TODAY), selected: { routines: [], trackers: [], goals: [] }, count: 0, waiting: [] })
          })()} />
        </Panel>
        <Panel name="preview-area-off" title="Preview: an area is off, and goal slots are full">
          <PackPreviewView {...preview({ pack: money, plan: { ...moneyPlan, goals: [], skip: [{ kind: 'goal', key: 'fewer-orders', name: money.goals[0].title, reason: 'goal_slots' }] }, offAreas: ['wealth'], selected: { routines: moneyPlan.routines.map((r) => r.key), trackers: [], goals: [] }, count: 4, waiting: [], recorded: {} })} />
        </Panel>
        <Panel name="preview-busy-error" title="Preview: adding (button busy) and an error">
          <PackPreviewView {...preview({ busy: true, error: 'Could not add this pack. Nothing was saved. Try again.', typed: { 'active-days': '2' }, count: 5, waiting: [] })} />
        </Panel>
      </div>
      <div data-gallery="export" className="flex flex-wrap items-start gap-6">
        <Panel name="export-ready" title="Share my setup: ready"><ExportView {...exp()} /></Panel>
        <Panel name="export-loading" title="Share my setup: loading"><ExportView {...exp({ state: 'loading', choices: undefined })} /></Panel>
        <Panel name="export-empty" title="Share my setup: nothing to share yet"><ExportView {...exp({ choices: { routines: [], trackers: [], goals: [] }, selected: { routines: [], trackers: [], goals: [] } })} /></Panel>
        <Panel name="export-errors" title="Share my setup: could not read, and a file error"><div className="flex flex-col gap-6">
          <ExportView {...exp({ state: 'error', choices: undefined, error: 'Your setup could not be read.' })} />
          <ExportView {...exp({ error: 'This setup can’t be saved as a pack: routines.0.name is required.' })} />
        </div></Panel>
      </div>
    </div>
  )
}
