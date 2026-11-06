'use client'

import { useActionState, useEffect, useId, useState, useTransition } from 'react'
import { ArrowLeftRight, Blocks, Bot, Clock, Cpu, KeyRound, Lock, Plug, RefreshCw } from 'lucide-react'
import type { Category } from '@/db/schema'
import type { SetupField } from '@/core/types'
import { connectIntegration, disconnectIntegration, syncNow } from '@/app/actions'
import { CATEGORY } from '../tokens'
import { Badge } from './card'
import { Button } from './button'
import { Field, Input } from './form'
import { FormError } from './forms/dialog'
import { CenterMorphModal, CenterMorphModalContent, CenterMorphModalTrigger } from '@/ui/beui/motion/center-morph-modal'
import { useToast } from './toast'
import { cn } from '../cn'

export type ConnectorStatus = 'ok' | 'error' | 'setup' | 'off' | 'waiting' | 'ready'
/** A dialog field plus what the server already has for it. Secret values are never sent. */
export type FieldView = SetupField & { saved: boolean; fromEnv: boolean; value?: string }
export type ConnectorSection = 'built-in' | 'keys' | 'messaging' | 'ai'
export type ConnectorItem = {
  id: string
  name: string
  section: ConnectorSection
  /** Life area for data sources; Telegram and AI have none. */
  category?: Category
  description: string
  provides: string[]
  missingEnv: string[]
  status: ConnectorStatus
  /** Detail line under the description, e.g. "Every hour · synced 3 min ago". */
  detail: string
  error?: string | null
  /** Overrides the section's badge, e.g. "Runs locally". */
  badge?: string
  /** Overrides the status label, e.g. "Waiting for first sync". */
  statusLabel?: string
  connected: boolean
  /** Data sources get a Sync now button once connected. */
  sync?: boolean
  fields: FieldView[]
}

// Brand logos live in public/connectors (see its README for sources and licences).
const LOGO: Record<string, string> = {
  github: '/connectors/github.svg',
  binance: '/connectors/binance.svg',
  gmail: '/connectors/gmail.svg',
  'icloud-inbox': '/connectors/icloud.svg',
  telegram: '/connectors/telegram.svg',
  anthropic: '/connectors/anthropic.svg',
  openai: '/connectors/openai.svg',
  google: '/connectors/gemini.svg',
  openrouter: '/connectors/openrouter.svg',
  local: '/connectors/ollama.svg',
}
const FALLBACK_ICON: Record<string, typeof Plug> = { fx: ArrowLeftRight }

const SECTIONS: { key: ConnectorSection; title: string; icon: typeof Plug; badge: string }[] = [
  { key: 'built-in', title: 'Built in', icon: Blocks, badge: 'Built in' },
  { key: 'keys', title: 'Your keys', icon: KeyRound, badge: 'Your key' },
  { key: 'messaging', title: 'Messaging', icon: Bot, badge: 'Your bot' },
  { key: 'ai', title: 'AI models', icon: Cpu, badge: 'Your key' },
]

const STATUS: Record<ConnectorStatus, { label: string; color: string }> = {
  ok: { label: 'Connected', color: 'var(--good)' },
  error: { label: 'Sync failing', color: 'var(--bad)' },
  setup: { label: 'Key missing', color: 'var(--warn)' },
  off: { label: 'Not connected', color: 'var(--ink-3)' },
  waiting: { label: 'Almost there', color: 'var(--warn)' },
  ready: { label: 'Ready, not in use', color: 'var(--pill)' },
}

/** Marketplace-style grid of everything ReLife connects to, filterable by section. */
export function ConnectorMarket({ items }: { items: ConnectorItem[] }) {
  const [filter, setFilter] = useState<ConnectorSection | 'all'>('all')
  const sections = SECTIONS
    .map((s) => ({ ...s, items: items.filter((i) => i.section === s.key) }))
    .filter((s) => s.items.length)
  const shown = sections.filter((s) => filter === 'all' || s.key === filter)
  const connected = items.filter((i) => i.connected).length

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start gap-3 rounded-lg p-4 text-[14px] leading-relaxed text-ink-2 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--pill)_30%,transparent)]" style={{ background: 'color-mix(in oklch, var(--pill) 9%, transparent)' }}>
        <Plug className="mt-0.5 size-[18px] shrink-0 text-pill-ink" strokeWidth={1.5} aria-hidden />
        <p>
          <span className="font-semibold text-ink">Bring your own keys.</span> Nothing syncs until you connect it. Keys you enter are encrypted
          in your local database, and values already in <code className="rounded-xs bg-surface/70 px-1 text-[12.5px]">.env</code> fill in any field you leave blank.
          A new source is one file, see <code className="rounded-xs bg-surface/70 px-1 text-[12.5px]">docs/CONNECTORS.md</code>.{' '}
          <span className="text-ink-3 tabular-nums">{connected} of {items.length} connected.</span>
        </p>
      </div>

      <div role="group" aria-label="Filter connectors" className="-mb-2 flex flex-wrap gap-2">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')} label="All" count={items.length} />
        {sections.map((s) => <Chip key={s.key} active={filter === s.key} onClick={() => setFilter(s.key)} label={s.title} count={s.items.length} />)}
      </div>

      {shown.map((s) => (
        <section key={s.key} aria-labelledby={`sec-${s.key}`} className="flex flex-col gap-4">
          <h2 id={`sec-${s.key}`} className="flex items-center gap-3 text-[17px] font-semibold tracking-[-0.01em] text-ink">
            <span aria-hidden className="grid size-8 place-items-center rounded-[10px] bg-surface text-ink-2 shadow-1"><s.icon className="size-4" strokeWidth={2} /></span>
            {s.title}
            <span className="font-normal text-ink-3 tabular-nums">{s.items.length}</span>
          </h2>
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {s.items.map((i) => <li key={i.id} className="flex"><ConnectorCard c={i} badge={s.badge} /></li>)}
          </ul>
        </section>
      ))}
    </div>
  )
}

function Chip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-full px-4 text-[14px] font-medium transition-[background-color,color,scale] duration-150 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill',
        active ? 'bg-ink text-bg shadow-1' : 'bg-surface text-ink-2 shadow-1 hover:text-ink',
      )}
    >
      {label}
      <span className={cn('tabular-nums', active ? 'opacity-60' : 'text-ink-3')}>{count}</span>
    </button>
  )
}

/** White logo tile in both themes, with the 1px image outline (black 10% light, white 10% dark). */
function Logo({ id, category }: { id: string; category?: Category }) {
  const src = LOGO[id]
  if (src) {
    return (
      <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-[12px] bg-white shadow-[0_0_0_1px_oklch(0_0_0/0.1)] dark:shadow-[0_0_0_1px_oklch(1_0_0/0.1)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- local SVGs, nothing to optimise */}
        <img src={src} alt="" width={28} height={28} className="size-7" />
      </span>
    )
  }
  const Icon = FALLBACK_ICON[id] ?? Plug
  const cat = category ? CATEGORY[category] : undefined
  return (
    <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-[12px]" style={{ background: cat?.wash ?? 'var(--surface-2)', color: cat?.color ?? 'var(--ink-2)' }}>
      <Icon className="size-6" strokeWidth={1.75} />
    </span>
  )
}

function ConnectorCard({ c, badge }: { c: ConnectorItem; badge: string }) {
  const cat = c.category ? CATEGORY[c.category] : undefined
  const status = STATUS[c.status]
  const chips = c.provides.slice(0, 3)
  const more = c.provides.length - chips.length
  return (
    <article className="flex w-full flex-col rounded-lg bg-surface p-5 shadow-1">
      <div className="flex items-start gap-4">
        <Logo id={c.id} category={c.category} />
        <div className="min-w-0">
          <h3 className="truncate text-[16px] font-semibold tracking-[-0.01em] text-ink">{c.name}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge color={c.section === 'built-in' || c.badge ? undefined : 'var(--pill)'}>{c.badge ?? badge}</Badge>
            {cat ? <><span aria-hidden className="h-3 w-px bg-divider" /><Badge color={cat.color}>{cat.label}</Badge></> : null}
          </div>
        </div>
      </div>

      <ul aria-label="Provides" className="mt-4 flex flex-wrap gap-1.5">
        {chips.map((p) => <li key={p} className="inline-flex h-7 items-center rounded-full px-2.5 text-[12.5px] text-ink-2 shadow-[inset_0_0_0_1px_var(--hairline)]">{p}</li>)}
        {more > 0 ? <li className="inline-flex h-7 items-center rounded-full px-2.5 text-[12.5px] text-ink-3 shadow-[inset_0_0_0_1px_var(--hairline)]" title={c.provides.slice(3).join(', ')}>+{more}</li> : null}
      </ul>

      <p className="mt-3 text-[13.5px] leading-relaxed text-ink-2">{c.description}</p>

      <div className="mt-3 flex items-start gap-2 text-[13px] text-ink-2">
        {!c.connected
          ? <><KeyRound className="mt-0.5 size-4 shrink-0 text-ink-3" strokeWidth={1.5} aria-hidden /><span>{c.fields.some((f) => f.secret) ? `Needs your ${c.fields.filter((f) => f.secret).map((f) => lowerFirst(f.label)).join(' and ')}` : 'No key needed'}</span></>
          : c.missingEnv.length
          ? <><KeyRound className="mt-0.5 size-4 shrink-0 text-ink-3" strokeWidth={1.5} aria-hidden /><span className="flex flex-wrap items-center gap-1">Add {c.missingEnv.map((e) => <code key={e} className="rounded-xs bg-surface-2 px-1 text-[12px]">{e}</code>)} to .env</span></>
          : <><Clock className="mt-0.5 size-4 shrink-0 text-ink-3" strokeWidth={1.5} aria-hidden /><span className="tabular-nums">{c.detail}</span></>}
      </div>
      {c.error && c.status === 'error' ? <p className="mt-2 line-clamp-2 text-[12.5px] text-bad">{c.error}</p> : null}

      <div className="mt-auto pt-5">
        <div className="flex min-h-10 items-center justify-between gap-3 border-t border-divider pt-4">
          <span className="inline-flex items-center gap-2 text-[13px] font-medium text-ink-2">
            <span aria-hidden className="size-2 rounded-full" style={{ background: status.color }} />
            {c.statusLabel ?? status.label}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            {c.connected && c.sync ? <SyncButton id={c.id} name={c.name} /> : null}
            <ConnectButton c={c} />
          </div>
        </div>
      </div>
    </article>
  )
}

/** "API key" stays, "Personal access token" → "personal access token". */
const lowerFirst = (s: string) => (/^[A-Z][A-Z]/.test(s) ? s : s[0].toLowerCase() + s.slice(1))

function SyncButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition()
  const toast = useToast()
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() => start(async () => {
        const t = toast.loading(`Syncing ${name}…`)
        const r = await syncNow(id)
        toast.update(t, r.ok ? `${name} synced · ${r.events} new` : (r.error ?? 'Sync failed'), r.ok ? 'good' : 'bad')
      })}
    >
      <RefreshCw className={pending ? 'size-3.5 animate-spin' : 'size-3.5'} strokeWidth={1.5} />
      Sync now
    </Button>
  )
}

/** beui.dev center-morph-modal: the panel unfolds from its centre and folds back on close. */
function ConnectButton({ c }: { c: ConnectorItem }) {
  const [open, setOpen] = useState(false)
  const uid = useId()
  const title = c.connected ? c.name : `Connect ${c.name}`
  return (
    <CenterMorphModal open={open} onOpenChange={setOpen}>
      <CenterMorphModalTrigger>
        <Button size="sm" variant={c.connected ? 'secondary' : 'primary'}>{c.connected ? 'Manage' : 'Connect'}</Button>
      </CenterMorphModalTrigger>
      <CenterMorphModalContent
        ariaLabel={title}
        ariaDescribedBy={`${uid}-desc`}
        closeButtonLabel="Close"
        // Radius stays 30px: the unfold clip-path uses the same value.
        className="max-w-[480px] border-0 bg-surface shadow-[inset_0_0_0_1px_var(--hairline)]"
        backdropClassName="bg-[oklch(0.178_0_0/0.28)]"
      >
        <div className="p-6">
          <header className="mb-5 flex items-start gap-4 pr-10">
            <Logo id={c.id} category={c.category} />
            <div className="min-w-0">
              <h2 className="font-display text-[20px] leading-tight font-bold tracking-[-0.02em] text-ink">{title}</h2>
              <p id={`${uid}-desc`} className="mt-1 text-[13px] leading-relaxed text-ink-3">{c.description}</p>
            </div>
          </header>
          <ConnectForm c={c} onDone={() => setOpen(false)} />
        </div>
      </CenterMorphModalContent>
    </CenterMorphModal>
  )
}

function ConnectForm({ c, onDone }: { c: ConnectorItem; onDone: () => void }) {
  const [state, action, pending] = useActionState(connectIntegration.bind(null, c.id), null)
  const [leaving, startLeave] = useTransition()
  const toast = useToast()
  const uid = useId()
  useEffect(() => {
    if (state?.ok) { toast(c.connected ? `${c.name} saved` : `${c.name} connected`, 'good'); onDone() }
  }, [state, c.connected, c.name, onDone, toast])

  return (
    <form action={action} className="flex flex-col gap-4">
      {c.fields.length ? c.fields.map((f) => (
        <Field
          key={f.env}
          htmlFor={`${uid}-${f.env}`}
          label={<>{f.label}{f.optional ? <span className="font-normal text-ink-3"> (optional)</span> : null}</>}
          hint={f.hint}
        >
          <Input
            id={`${uid}-${f.env}`}
            name={f.env}
            type={f.secret ? 'password' : 'text'}
            autoComplete="off"
            spellCheck={false}
            maxLength={500}
            defaultValue={f.secret ? undefined : f.value}
            placeholder={f.secret && f.saved ? 'Saved. Leave blank to keep it' : f.fromEnv ? 'Found in .env. Leave blank to use it' : f.placeholder}
            className="font-mono text-[13px]"
          />
        </Field>
      )) : (
        <p className="text-[14px] text-ink-2">No key needed. Connect and ReLife starts syncing within a minute.</p>
      )}

      {c.fields.some((f) => f.secret) ? (
        <p className="flex items-start gap-2 text-[12.5px] text-ink-3">
          <Lock className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
          Keys are encrypted in your local database and only sent to {c.name}.
        </p>
      ) : null}

      <FormError message={state && !state.ok ? state.error : undefined} />

      <div className="flex items-center gap-2 pt-1">
        {c.connected ? (
          <Button
            variant="danger"
            disabled={leaving || pending}
            onClick={() => startLeave(async () => {
              try { await disconnectIntegration(c.id); toast(`${c.name} disconnected`, 'neutral'); onDone() } catch { toast('Could not disconnect. Try again.', 'bad') }
            })}
          >
            {leaving ? 'Disconnecting…' : 'Disconnect'}
          </Button>
        ) : null}
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onDone}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={pending || leaving}>
            {pending ? (c.connected ? 'Saving…' : 'Connecting…') : c.connected ? 'Save' : 'Connect'}
          </Button>
        </div>
      </div>
    </form>
  )
}
