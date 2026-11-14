'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { LayoutTemplate } from 'lucide-react'
import { PACK_MAX_BYTES, parsePack, type Pack } from '@relife/contract'
import { applyPackAction, exportPackAction, packExportChoicesAction, previewPackAction, undoPackAction } from '@/app/actions'
import type { PackPreview } from '@/core/packs'
import { COMMUNITY_BASE, CommunityIndex, communityPackUrl, packErrorText } from '@/domain/pack-source'
import { countsLine, planPack, stateFromJson } from '@/domain/packs'
import { BUILT_IN_PACKS } from '@/packs'
import { Dialog } from '../forms/dialog'
import { useToast } from '../toast'
import { ExportView, PackPreviewView, TemplatesHome, type CommunityState, type ExportChoices, type PackCardInfo, type TemplatesHomeProps } from './templates-view'
import { TOO_BIG, fetchText } from './pack-fetch'

// "Templates": the starter packs, a file, a link, the community list and "Share my setup". Every route ends at the same
// preview, which shows what would be added and what would be left out; nothing is saved before "Add". The pack's text
// goes to the server as it is and is parsed again there.

type Screen = { name: 'home' } | { name: 'preview'; text: string; pack: Pack; preview: PackPreview } | { name: 'export' }

const CARDS: PackCardInfo[] = BUILT_IN_PACKS.map((p) => ({ id: p.id, name: p.name, description: p.description, areas: p.areas as PackCardInfo['areas'], counts: countsLine(p) }))

export function TemplatesDialog({ open, onClose, initialLink = '' }: { open: boolean; onClose: () => void; initialLink?: string }) {
  // Closed: forget this run after the exit animation, so the next opening starts at the list.
  const [mounted, setMounted] = useState(open)
  useEffect(() => {
    if (open) { setMounted(true); return }
    const t = setTimeout(() => setMounted(false), 250)
    return () => clearTimeout(t)
  }, [open])
  return (
    <Dialog open={open} onClose={onClose} icon={LayoutTemplate} title="Templates" description="Routines, trackers and goals that someone already worked out. You choose what to add." width="max-w-[640px]">
      {mounted ? <Body onClose={onClose} initialLink={initialLink} /> : null}
    </Dialog>
  )
}

function Body({ onClose, initialLink }: { onClose: () => void; initialLink: string }) {
  const [screen, setScreen] = useState<Screen>({ name: 'home' })
  const [link, setLink] = useState(initialLink)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<TemplatesHomeProps['error']>()
  const [community, setCommunity] = useState<CommunityState>({ state: 'idle', items: [] })

  const openText = useCallback(async (text: string, id: string, where: NonNullable<TemplatesHomeProps['error']>['where']) => {
    setBusy(id); setError(undefined)
    try {
      const parsed = parsePack(text) // the quick answer; the server checks again
      if (!parsed.ok) { setError({ where, message: packErrorText(parsed.error) }); return }
      const r = await previewPackAction(text)
      if (!r.ok) setError({ where, message: packErrorText(r.error) })
      else setScreen({ name: 'preview', text, pack: r.pack, preview: r.preview })
    } catch {
      setError({ where, message: 'Something went wrong opening this pack. Try again.' })
    } finally { setBusy(null) }
  }, [])

  const home: TemplatesHomeProps = {
    builtIn: CARDS, community, link, busy, error,
    onOpenBuiltIn: (id) => { const p = BUILT_IN_PACKS.find((x) => x.id === id); if (p) void openText(JSON.stringify(p), id, 'builtin') },
    onFile: async (f) => {
      if (f.size > PACK_MAX_BYTES) { setError({ where: 'file', message: TOO_BIG }); return }
      setBusy('file'); setError(undefined)
      let text = ''
      try { text = await f.text() } catch { setBusy(null); setError({ where: 'file', message: 'That file could not be read.' }); return }
      setBusy(null)
      await openText(text, 'file', 'file')
    },
    onLink: setLink,
    onOpenLink: async () => {
      setBusy('link'); setError(undefined)
      const r = await fetchText(link)
      setBusy(null)
      if (!r.ok) { setError({ where: 'link', message: r.error }); return }
      await openText(r.text, 'link', 'link')
    },
    onLoadCommunity: async () => {
      setCommunity({ state: 'loading', items: [] })
      const r = await fetchText(`${COMMUNITY_BASE}/index.json`)
      if (!r.ok) { setCommunity({ state: 'error', items: [], error: r.error }); return }
      let json: unknown
      try { json = JSON.parse(r.text) } catch { json = null }
      const list = CommunityIndex.safeParse(json)
      setCommunity(list.success ? { state: 'ready', items: list.data } : { state: 'error', items: [], error: 'The community list is not in a format this version understands.' })
    },
    onOpenCommunity: async (id) => {
      setBusy(id); setError(undefined)
      const r = await fetchText(communityPackUrl(id))
      setBusy(null)
      if (!r.ok) { setError({ where: 'community', message: r.error }); return }
      await openText(r.text, id, 'community')
    },
    onShare: () => setScreen({ name: 'export' }),
  }

  if (screen.name === 'preview') return <PreviewScreen key={screen.preview.today + screen.pack.id} screen={screen} onBack={() => setScreen({ name: 'home' })} onDone={onClose} />
  if (screen.name === 'export') return <ExportScreen onBack={() => setScreen({ name: 'home' })} />
  return <TemplatesHome {...home} />
}

// ─── Preview and add ───

function PreviewScreen({ screen, onBack, onDone }: { screen: Extract<Screen, { name: 'preview' }>; onBack: () => void; onDone: () => void }) {
  const toast = useToast()
  const { pack, preview, text } = screen
  const state = useMemo(() => stateFromJson(preview.state), [preview.state])
  const [addAreas, setAddAreas] = useState(true)
  const [off, setOff] = useState<Set<string>>(() => new Set())
  const [typed, setTyped] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const plan = useMemo(() => planPack(pack, state, preview.today, { addAreas }), [pack, state, preview.today, addAreas])
  const recorded = useMemo(() => Object.fromEntries(Object.entries(preview.baselines).map(([k, v]) => [k, v.value])), [preview.baselines])
  const number = (key: string) => { const t = typed[key]?.trim(); const n = t ? Number(t) : NaN; return Number.isFinite(n) ? n : undefined }
  const on = (kind: string, key: string) => !off.has(`${kind}:${key}`)
  const picked = {
    routines: plan.routines.filter((r) => on('routines', r.key)).map((r) => r.key),
    trackers: [...plan.trackers, ...plan.targets].filter((t) => on('trackers', t.slug)).map((t) => t.slug),
    goals: plan.goals.filter((g) => on('goals', g.key)).map((g) => g.key),
  }
  const ready = picked.goals.filter((k) => recorded[k] != null || number(k) !== undefined)
  const chosen = planPack(pack, state, preview.today, { routineKeys: picked.routines, trackerSlugs: picked.trackers, goalKeys: ready, addAreas })
  const count = chosen.routines.length + chosen.trackers.length + chosen.targets.length + chosen.goals.length
  const waiting = plan.goals.filter((g) => picked.goals.includes(g.key) && !ready.includes(g.key)).map((g) => g.title)
  const offAreas = useMemo(() => {
    const all = planPack(pack, state, preview.today, { addAreas: true }).areasToAdd
    return all
  }, [pack, state, preview.today])

  const apply = async () => {
    setBusy(true); setError(undefined)
    try {
      const r = await applyPackAction(text, {
        routineKeys: chosen.routines.map((x) => x.key),
        trackerSlugs: [...chosen.trackers, ...chosen.targets].map((x) => x.slug),
        goals: chosen.goals.map((g) => ({ key: g.key, ...(recorded[g.key] == null ? { baselineValue: number(g.key) } : {}) })),
        addAreas,
      })
      if (!r.ok) { setError(r.error); return }
      const made = r.created.scheduleIds.length + r.created.trackerIds.length + r.created.goalIds.length
      if (made) {
        toast(r.line, 'good', {
          description: pack.name, duration: 10_000,
          action: { label: 'Undo', onClick: () => { void undoPackAction(r.importId).then((u) => (u.ok ? toast('Taken back', 'good') : toast.error(u.error))).catch(() => toast.error('Could not undo')) } },
        })
      } else toast(r.line)
      if (r.failed.length) toast.error(`${r.failed.length === 1 ? 'A goal was' : `${r.failed.length} goals were`} not added`, r.failed.map((f) => `${f.name}: ${f.message}`).join(' '))
      onDone()
    } catch {
      setError('Could not add this pack. Nothing was saved. Try again.')
    } finally { setBusy(false) }
  }

  return (
    <PackPreviewView
      pack={pack} plan={{ ...plan, skip: [...plan.skip, ...chosen.skip.filter((s) => !plan.skip.some((o) => o.kind === s.kind && o.key === s.key))] }}
      selected={{ routines: picked.routines, trackers: picked.trackers, goals: picked.goals.filter((k) => !chosen.skip.some((s) => s.kind === 'goal' && s.key === k)) }}
      recorded={recorded} typed={typed} addAreas={addAreas} offAreas={offAreas} count={count} busy={busy} error={error} waiting={waiting}
      onToggle={(kind, key, v) => setOff((s) => { const n = new Set(s); if (v) n.delete(`${kind}:${key}`); else n.add(`${kind}:${key}`); return n })}
      onTyped={(k, v) => setTyped((t) => ({ ...t, [k]: v }))} onAddAreas={setAddAreas} onBack={onBack} onApply={apply}
    />
  )
}

// ─── Share my setup ───

function ExportScreen({ onBack }: { onBack: () => void }) {
  const toast = useToast()
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [choices, setChoices] = useState<ExportChoices>()
  const [selected, setSelected] = useState({ routines: [] as string[], trackers: [] as string[], goals: [] as string[] })
  const [form, setForm] = useState({ name: 'My setup', description: '', author: '', includeNotes: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    setState('loading')
    packExportChoicesAction().then((c) => { if (live) { setChoices(c); setState('ready') } }).catch(() => { if (live) setState('error') })
    return () => { live = false }
  }, [attempt])

  const download = async () => {
    setBusy(true); setError(undefined)
    try {
      const r = await exportPackAction({ scheduleIds: selected.routines, trackerIds: selected.trackers, goalIds: selected.goals, ...form, author: form.author || undefined })
      if (!r.ok) { setError(r.error); return }
      const href = URL.createObjectURL(new Blob([r.text], { type: 'application/json' }))
      const a = Object.assign(document.createElement('a'), { href, download: r.filename })
      a.click()
      setTimeout(() => URL.revokeObjectURL(href), 1000)
      toast('Pack file saved', 'good', { description: r.filename })
    } catch { setError('The pack could not be made. Try again.') } finally { setBusy(false) }
  }

  return (
    <ExportView
      state={state} choices={choices} selected={selected} form={form} error={error} busy={busy}
      onToggle={(kind, id, on) => setSelected((s) => ({ ...s, [kind]: on ? [...s[kind], id] : s[kind].filter((x) => x !== id) }))}
      onForm={(patch) => setForm((f) => ({ ...f, ...patch }))} onBack={onBack} onRetry={() => setAttempt((n) => n + 1)} onDownload={download}
    />
  )
}
