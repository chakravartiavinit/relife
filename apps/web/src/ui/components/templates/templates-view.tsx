'use client'

import { useRef } from 'react'
import { AlertCircle, ArrowLeft, Download, FileUp, Globe, LoaderCircle, Link2, Share2 } from 'lucide-react'
import type { Pack } from '@relife/contract'
import type { Category } from '@/db/schema'
import type { CommunityEntry } from '@/domain/pack-source'
import { SKIP_TEXT, countsLine, describePackRule, type PackPlan } from '@/domain/packs'
import { Checkbox } from '@/ui/beui/motion/checkbox'
import { cn } from '../../cn'
import { CATEGORY } from '../../tokens'
import { Badge } from '../card'
import { Button } from '../button'
import { Field, Input, Textarea } from '../form'
import { FormError } from '../forms/dialog'

// The Templates dialog's screens, presentational: the dialog (templates-dialog.tsx) owns fetching and the actions, and
// `/dev/ui` draws every state from fixtures. Text that came from a pack is always a plain text node, never HTML or a link.

// ─── Home: where a pack can come from ───

export type PackCardInfo = { id: string; name: string; description: string; author?: string; areas: Category[]; counts?: string }
export type CommunityState = { state: 'idle' | 'loading' | 'ready' | 'error'; items: CommunityEntry[]; error?: string }

export type TemplatesHomeProps = {
  builtIn: PackCardInfo[]
  community: CommunityState
  link: string
  /** Which source is being opened: a built-in or community id, "link" or "file". */
  busy: string | null
  error?: { where: 'file' | 'link' | 'community' | 'builtin'; message: string }
  onOpenBuiltIn: (id: string) => void
  onOpenCommunity: (id: string) => void
  onFile: (file: File) => void
  onLink: (value: string) => void
  onOpenLink: () => void
  onLoadCommunity: () => void
  onShare: () => void
}

export function TemplatesHome(p: TemplatesHomeProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const err = (where: NonNullable<TemplatesHomeProps['error']>['where']) => (p.error?.where === where ? p.error.message : undefined)
  return (
    <div className="flex flex-col gap-7">
      {p.builtIn.length ? (
        <Section title="Starter packs" hint="Made for this app. Each one shows exactly what it adds before anything is saved.">
          <FormError message={err('builtin')} />
          <ul className="flex flex-col gap-2">
            {p.builtIn.map((c) => <li key={c.id}><PackCard pack={c} busy={p.busy === c.id} disabled={!!p.busy} onOpen={() => p.onOpenBuiltIn(c.id)} /></li>)}
          </ul>
        </Section>
      ) : null}

      <Section title="From a file or a link" hint="A pack is a small JSON file (up to 64 KB). Links are opened from this browser, not from the server.">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileInput} type="file" accept=".json,application/json" className="sr-only" tabIndex={-1} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) p.onFile(f) }} />
            <Button variant="secondary" disabled={!!p.busy} onClick={() => fileInput.current?.click()}>
              {p.busy === 'file' ? <LoaderCircle className="size-4 animate-spin" strokeWidth={1.5} aria-hidden /> : <FileUp className="size-4" strokeWidth={1.5} aria-hidden />}Choose a pack file
            </Button>
          </div>
          <FormError message={err('file')} />
          <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); p.onOpenLink() }}>
            <Field label="Or open a link" htmlFor="pack-link" className="min-w-0 flex-1">
              <Input id="pack-link" type="url" inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://…/my-pack.relife-pack.json" value={p.link} onChange={(e) => p.onLink(e.target.value)} />
            </Field>
            <Button type="submit" variant="secondary" disabled={!!p.busy || !p.link.trim()}>
              {p.busy === 'link' ? <LoaderCircle className="size-4 animate-spin" strokeWidth={1.5} aria-hidden /> : <Link2 className="size-4" strokeWidth={1.5} aria-hidden />}Open link
            </Button>
          </form>
          <FormError message={err('link')} />
        </div>
      </Section>

      <Section title="Community packs" hint="Shared by other people in the open. Nothing is fetched until you ask.">
        <Community {...p} />
      </Section>

      <Section title="Share my setup" hint="Turn your own routines and goals into a pack file you can send to someone.">
        <div><Button variant="secondary" disabled={!!p.busy} onClick={p.onShare}><Share2 className="size-4" strokeWidth={1.5} aria-hidden />Choose what to share</Button></div>
      </Section>
    </div>
  )
}

function Community(p: TemplatesHomeProps) {
  const { state, items, error } = p.community
  if (state === 'idle') return <div><Button variant="secondary" disabled={!!p.busy} onClick={p.onLoadCommunity}><Globe className="size-4" strokeWidth={1.5} aria-hidden />Show community packs</Button></div>
  if (state === 'loading') return <p role="status" className="flex items-center gap-2 text-small text-ink-3"><LoaderCircle className="size-4 animate-spin" strokeWidth={1.5} aria-hidden />Asking GitHub for the list…</p>
  if (state === 'error') {
    return (
      <div role="alert" className="flex flex-col items-start gap-2">
        <p className="flex items-start gap-2 text-small text-ink-2"><AlertCircle className="mt-0.5 size-4 shrink-0 text-bad" strokeWidth={1.5} aria-hidden />{error ?? 'The list could not be loaded.'}</p>
        <Button size="sm" onClick={p.onLoadCommunity}>Try again</Button>
      </div>
    )
  }
  const open = p.error?.where === 'community' ? p.error.message : undefined
  return items.length ? (
    <div className="flex flex-col gap-2">
      <FormError message={open} />
      <ul className="flex flex-col gap-2">
        {items.map((c) => <li key={c.id}><PackCard pack={c} busy={p.busy === c.id} disabled={!!p.busy} onOpen={() => p.onOpenCommunity(c.id)} /></li>)}
      </ul>
    </div>
  ) : <p className="text-small text-ink-3">No community packs yet. Yours could be the first: see docs/TEMPLATES.md.</p>
}

function PackCard({ pack, busy, disabled, onOpen }: { pack: PackCardInfo; busy: boolean; disabled: boolean; onOpen: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface-2 p-4 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1">
        <h4 className="text-body font-semibold text-ink">{pack.name}</h4>
        <p className="mt-0.5 text-small text-ink-2 text-pretty">{pack.description}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {pack.areas.map((a) => <Badge key={a} color={CATEGORY[a].color}>{CATEGORY[a].label}</Badge>)}
          {pack.counts ? <span className="text-caption text-ink-3 tabular-nums">{pack.counts}</span> : null}
          {pack.author ? <span className="text-caption text-ink-3">by {pack.author}</span> : null}
        </div>
      </div>
      <Button size="md" disabled={disabled} onClick={onOpen} aria-label={`Preview ${pack.name}`} className="self-start">
        {busy ? <LoaderCircle className="size-4 animate-spin" strokeWidth={1.5} aria-hidden /> : null}Preview
      </Button>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-small font-semibold text-ink">{title}</h3>
        {hint ? <p className="mt-0.5 text-caption text-ink-3 text-pretty">{hint}</p> : null}
      </div>
      {children}
    </section>
  )
}

// ─── Preview: what adding the pack does, before it does it ───

export type PreviewViewProps = {
  pack: Pick<Pack, 'name' | 'description' | 'author' | 'homepage' | 'routines' | 'trackers' | 'goals'>
  /** Everything that would be added with the current areas choice (before untick). */
  plan: PackPlan
  /** Keys the person has ticked, among the plan's items. */
  selected: { routines: string[]; trackers: string[]; goals: string[] }
  /** Per goal key: the recorded 28-day value, or null when it needs a number from the person. */
  recorded: Record<string, number | null>
  typed: Record<string, string>
  addAreas: boolean
  /** Areas the pack is in that the person has off. */
  offAreas: Category[]
  /** What will be added now: ticked items, minus goals still without a number. */
  count: number
  busy?: boolean
  error?: string
  /** Names of ticked goals that still need a number. */
  waiting: string[]
  onToggle: (kind: 'routines' | 'trackers' | 'goals', key: string, on: boolean) => void
  onTyped: (key: string, value: string) => void
  onAddAreas: (on: boolean) => void
  onBack: () => void
  onApply: () => void
}

export function PackPreviewView(p: PreviewViewProps) {
  const { plan } = p
  const empty = !plan.routines.length && !plan.trackers.length && !plan.targets.length && !plan.goals.length
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="font-display text-heading text-ink">{p.pack.name}</h3>
        <p className="mt-1 text-small text-ink-2 text-pretty">{p.pack.description}</p>
        <p className="mt-1 text-caption text-ink-3">
          {[p.pack.author ? `By ${p.pack.author}` : null, countsLine(p.pack)].filter(Boolean).join(' · ')}
          {p.pack.homepage ? <span className="block break-all">{p.pack.homepage}</span> : null}
        </p>
      </div>

      {p.offAreas.length ? (
        <div className="rounded-lg bg-surface-2 p-3">
          <Checkbox checked={p.addAreas} onCheckedChange={p.onAddAreas} label={`Turn on ${p.offAreas.map((a) => CATEGORY[a].label).join(' and ')}`}
            description={`This pack is for ${p.offAreas.length === 1 ? 'an area' : 'areas'} you have off. Without it those items are left out.`} />
        </div>
      ) : null}

      {empty ? (
        <p role="status" className="rounded-lg bg-surface-2 px-4 py-5 text-center text-small text-ink-2">
          Nothing new to add. Everything in this pack is already here{plan.skip.length ? ', or left out for the reasons below' : ''}.
        </p>
      ) : null}

      {plan.routines.length ? (
        <Group title="Routines">
          {plan.routines.map((r) => (
            <Item key={r.key} checked={p.selected.routines.includes(r.key)} onChange={(on) => p.onToggle('routines', r.key, on)} label={r.name}
              description={[describePackRule(r.rule), r.kind === 'medicine' ? ['Medicine', r.dose].filter(Boolean).join(': ') : null, r.note].filter(Boolean).join(' · ')} />
          ))}
        </Group>
      ) : null}

      {plan.trackers.length || plan.targets.length ? (
        <Group title="Trackers">
          {plan.trackers.map((t) => (
            <Item key={t.slug} checked={p.selected.trackers.includes(t.slug)} onChange={(on) => p.onToggle('trackers', t.slug, on)} label={t.name}
              description={[t.unit, t.target != null ? `target ${t.target}` : null].filter(Boolean).join(' · ') || 'A new tracker'} />
          ))}
          {plan.targets.map((t) => (
            <Item key={t.slug} checked={p.selected.trackers.includes(t.slug)} onChange={(on) => p.onToggle('trackers', t.slug, on)} label={`${t.name}: set a target`}
              description={`Yours has no target yet. This sets it to ${t.target}${t.unit ? ` ${t.unit}` : ''}.`} />
          ))}
        </Group>
      ) : null}

      {plan.goals.length ? (
        <Group title="Goals">
          {plan.goals.map((g) => {
            const on = p.selected.goals.includes(g.key)
            const rec = p.recorded[g.key]
            const unit = 'checkIn' in g.measure ? g.measure.unit : undefined
            return (
              <div key={g.key} className="flex flex-col gap-2">
                <Item checked={on} onChange={(v) => p.onToggle('goals', g.key, v)} label={g.title}
                  description={`${'checkIn' in g.measure ? g.measure.checkIn : 'Measured by a tracker'} · ${g.weeks} weeks`} />
                {on ? (
                  rec != null ? (
                    <p className="ms-8 text-caption text-ink-3 tabular-nums">Starts from your last 28 days: {rec}{unit ? ` ${unit}` : ''}.</p>
                  ) : (
                    <Field label={`Where you are today${unit ? ` (${unit})` : ''}`} htmlFor={`base-${g.key}`} hint="A goal starts from a number, so it can show how far you came." className="ms-8 max-w-60">
                      <Input id={`base-${g.key}`} type="number" inputMode="decimal" step="any" placeholder="0" value={p.typed[g.key] ?? ''} onChange={(e) => p.onTyped(g.key, e.target.value)} />
                    </Field>
                  )
                ) : null}
              </div>
            )
          })}
        </Group>
      ) : null}

      {plan.skip.length ? (
        <Group title="Left out">
          {plan.skip.map((s) => (
            <div key={`${s.kind}:${s.key}`} className="flex min-h-9 flex-col gap-0.5 py-1.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
              <span className="min-w-0 text-small text-ink-2">{s.name}</span>
              <span className="text-caption text-ink-3 sm:shrink-0">{SKIP_TEXT[s.reason]}</span>
            </div>
          ))}
        </Group>
      ) : null}

      <FormError message={p.error} />
      <div className="sticky bottom-0 -mx-6 flex flex-wrap items-center gap-2 border-t border-divider bg-surface px-6 py-3">
        <Button variant="ghost" onClick={p.onBack}><ArrowLeft className="size-4" strokeWidth={1.5} aria-hidden />Back</Button>
        {p.waiting.length ? <span className="text-caption text-ink-3 text-pretty">Add a number to include {p.waiting.length === 1 ? p.waiting[0] : `${p.waiting.length} goals`}.</span> : null}
        <Button variant="primary" className="ms-auto" disabled={!p.count || p.busy} onClick={p.onApply}>
          {p.busy ? <LoaderCircle className="size-4 animate-spin" strokeWidth={1.5} aria-hidden /> : null}
          {p.count ? `Add ${p.count} ${p.count === 1 ? 'item' : 'items'}` : 'Nothing to add'}
        </Button>
      </div>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-1 text-small font-semibold text-ink">{title}</h4>
      <div className="flex flex-col divide-y divide-divider">{children}</div>
    </section>
  )
}

function Item({ checked, onChange, label, description }: { checked: boolean; onChange: (on: boolean) => void; label: string; description?: string }) {
  return <div className="flex min-h-11 items-center py-1.5"><Checkbox checked={checked} onCheckedChange={onChange} label={label} description={description} className="w-full" /></div>
}

// ─── Share my setup ───

export type ExportChoices = { routines: { id: string; name: string; area: Category }[]; trackers: { id: string; name: string; area: Category }[]; goals: { id: string; name: string; area: Category }[] }
export type ExportViewProps = {
  state: 'loading' | 'ready' | 'error'
  choices?: ExportChoices
  selected: { routines: string[]; trackers: string[]; goals: string[] }
  form: { name: string; description: string; author: string; includeNotes: boolean }
  error?: string
  busy?: boolean
  onToggle: (kind: 'routines' | 'trackers' | 'goals', id: string, on: boolean) => void
  onForm: (patch: Partial<ExportViewProps['form']>) => void
  onBack: () => void
  onRetry: () => void
  onDownload: () => void
}

export function ExportView(p: ExportViewProps) {
  if (p.state === 'loading') return <div role="status" className="flex items-center gap-2 py-6 text-small text-ink-3"><LoaderCircle className="size-4 animate-spin" strokeWidth={1.5} aria-hidden />Looking at your setup…</div>
  if (p.state === 'error' || !p.choices) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 py-4">
        <p className="text-small text-ink-2">{p.error ?? 'Your setup could not be read.'}</p>
        <div className="flex gap-2"><Button variant="ghost" onClick={p.onBack}><ArrowLeft className="size-4" strokeWidth={1.5} aria-hidden />Back</Button><Button onClick={p.onRetry}>Try again</Button></div>
      </div>
    )
  }
  const c = p.choices
  const none = !c.routines.length && !c.trackers.length && !c.goals.length
  const total = p.selected.routines.length + p.selected.trackers.length + p.selected.goals.length
  return (
    <div className="flex flex-col gap-6">
      <p className="text-small text-ink-2 text-pretty">
        The file holds only what you tick, as it is set up: names, schedules and targets. It never holds your entries, values, baselines, dates, medicines, money or anything from a connection.
      </p>
      {none ? (
        <p className="rounded-lg bg-surface-2 px-4 py-5 text-center text-small text-ink-2">You have no routines, trackers or goals to share yet.</p>
      ) : (
        <>
          <PickGroup title="Routines" items={c.routines} selected={p.selected.routines} onToggle={(id, on) => p.onToggle('routines', id, on)} />
          <PickGroup title="Trackers" items={c.trackers} selected={p.selected.trackers} onToggle={(id, on) => p.onToggle('trackers', id, on)} />
          <PickGroup title="Goals" items={c.goals} selected={p.selected.goals} hint="A goal brings the tracker it measures. It never brings its baseline or dates, only its target and how many weeks it runs." onToggle={(id, on) => p.onToggle('goals', id, on)} />
          <div className="flex flex-col gap-4">
            <Field label="Pack name" htmlFor="export-name"><Input id="export-name" maxLength={60} value={p.form.name} onChange={(e) => p.onForm({ name: e.target.value })} /></Field>
            <Field label="What it is for" htmlFor="export-desc" hint="One or two sentences. Shown on the preview.">
              <Textarea id="export-desc" maxLength={280} value={p.form.description} onChange={(e) => p.onForm({ description: e.target.value })} />
            </Field>
            <Field label="Your name (optional)" htmlFor="export-author"><Input id="export-author" maxLength={60} value={p.form.author} onChange={(e) => p.onForm({ author: e.target.value })} /></Field>
            <Checkbox checked={p.form.includeNotes} onCheckedChange={(v) => p.onForm({ includeNotes: v })} label="Include my notes and goal reasons" description="Off by default. They may say more about you than you mean to share." />
          </div>
        </>
      )}
      <FormError message={p.error} />
      <div className={cn('sticky bottom-0 -mx-6 flex flex-wrap items-center gap-2 border-t border-divider bg-surface px-6 py-3')}>
        <Button variant="ghost" onClick={p.onBack}><ArrowLeft className="size-4" strokeWidth={1.5} aria-hidden />Back</Button>
        {!none ? (
          <Button variant="primary" className="ms-auto" disabled={!total || p.busy} onClick={p.onDownload}>
            {p.busy ? <LoaderCircle className="size-4 animate-spin" strokeWidth={1.5} aria-hidden /> : <Download className="size-4" strokeWidth={1.5} aria-hidden />}
            {total ? `Download ${total} ${total === 1 ? 'item' : 'items'}` : 'Tick something to share'}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function PickGroup({ title, items, selected, hint, onToggle }: { title: string; items: { id: string; name: string; area: Category }[]; selected: string[]; hint?: string; onToggle: (id: string, on: boolean) => void }) {
  if (!items.length) return null
  return (
    <section>
      <h4 className="mb-1 text-small font-semibold text-ink">{title}</h4>
      {hint ? <p className="mb-1 text-caption text-ink-3 text-pretty">{hint}</p> : null}
      <div className="flex flex-col divide-y divide-divider">
        {items.map((i) => <Item key={i.id} checked={selected.includes(i.id)} onChange={(on) => onToggle(i.id, on)} label={i.name} description={CATEGORY[i.area].label} />)}
      </div>
    </section>
  )
}
