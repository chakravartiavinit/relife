'use client'

import { useActionState, useEffect, useId, useState, useTransition } from 'react'
import { ArrowUpRight, Check, CircleCheck, LogIn } from 'lucide-react'
import { CATEGORY } from '../tokens'
import { connectIntegration } from '@/app/actions'
import { Button, buttonClass } from './button'
import { Input } from './form'
import { FormError } from './forms/dialog'
import { useToast } from './toast'
import { AppLogo as Logo } from './app-logo'
import { PeekLink } from './peek/peek-link'
import { isInline, needsFix } from '@/domain/connections'
import { STATUS } from './connector-status'
import { SyncButton, type ConnectorItem } from './connector-market'
import { Cmd, RecheckLocalAi } from './local-ai-check'
import { cn } from '../cn'

// The top of Connections, status first: what needs a fix (with the fix as the button), then every connected source
// with its health, last sync and what it brought in; then suggestions for the user's areas, where a username is
// the only thing a source needs, connecting is one field. Presentational: `ConnectorMarket` owns the dialogs and
// passes `manage` to render the button that opens one.

const HEALTHY_SHOWN = 8
const isData = (c: ConnectorItem) => c.section !== 'ai' && c.section !== 'messaging'
export { needsFix, isInline }

const fixLabel = (c: ConnectorItem) => (c.oauth ? 'Sign in again' : c.login ? 'Open login window' : c.status === 'setup' ? 'Add key' : 'Fix')
const synced = (c: ConnectorItem) => (c.syncs ?? []).reduce((n, r) => n + (r.ok === false ? 0 : r.events), 0)
const fmt = (n: number) => new Intl.NumberFormat('en-IN').format(n)

export type Manage = (c: ConnectorItem, trigger: React.ReactElement) => React.ReactNode

export function YourSources({ items, manage }: { items: ConnectorItem[]; manage: Manage }) {
  // The free local AI is listed only while it is not answering: then it is a source that needs a fix.
  const sources = items.filter((c) => c.connected && (isData(c) || (c.id === 'local' && needsFix(c))))
  const broken = sources.filter(needsFix)
  const healthy = sources.filter((c) => !needsFix(c))
  if (!sources.length) {
    return (
      <section aria-labelledby="your-sources" className="rounded-lg bg-surface p-5 shadow-1">
        <h2 id="your-sources" className="text-heading text-ink">Your sources</h2>
        <p className="mt-1 text-small text-ink-3">Nothing connected yet. Pick one of the suggestions below, or search the list. Nothing syncs until you connect it.</p>
      </section>
    )
  }
  const first = healthy.slice(0, HEALTHY_SHOWN), rest = healthy.slice(HEALTHY_SHOWN)
  return (
    <section aria-labelledby="your-sources" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 id="your-sources" className="text-heading text-ink">Your sources</h2>
        <span className="text-small text-ink-3 tabular-nums">{sources.length} connected{broken.length ? ` · ${broken.length} need a fix` : ''}</span>
      </div>
      {broken.map((c) => <FixRow key={c.id} c={c} manage={manage} />)}
      {healthy.length ? (
        <div className="rounded-lg bg-surface p-2 shadow-1 sm:p-3">
          <div aria-hidden className="hidden grid-cols-[minmax(0,1fr)_120px_120px_96px_88px] gap-3 px-3 pb-1 font-mono text-label text-ink-3 uppercase md:grid">
            <span>Source</span><span>Health</span><span>Last sync</span><span className="text-end">Synced</span><span />
          </div>
          <ul className="divide-y divide-divider">{first.map((c) => <SourceRow key={c.id} c={c} />)}</ul>
          {rest.length ? (
            <details className="group border-t border-divider">
              <summary className="flex min-h-10 cursor-pointer list-none items-center px-3 text-small font-medium text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-pill [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">Show {rest.length} more, all healthy</span>
                <span className="hidden group-open:inline">Show fewer</span>
              </summary>
              <ul className="divide-y divide-divider border-t border-divider">{rest.map((c) => <SourceRow key={c.id} c={c} />)}</ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

/** A source that needs the user, pinned on top: the problem in one sentence and the fix as the primary button. */
function FixRow({ c, manage }: { c: ConnectorItem; manage: Manage }) {
  const local = c.id === 'local' && c.section === 'ai'
  const problem = local ? c.detail : c.error || (c.missingEnv.length ? `Add ${c.missingEnv.join(', ')} to start syncing.` : c.statusLabel ?? STATUS[c.status].label)
  const last = c.lastSync ? ` Last good sync ${c.lastSync}.` : ''
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg p-3 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--bad)_35%,transparent)]" style={{ background: 'color-mix(in oklab, var(--bad) 7%, var(--surface))' }}>
      <Logo id={c.id} category={c.category} size="sm" />
      <div className="min-w-0 flex-1 basis-56">
        <PeekLink to={{ type: 'connector', id: c.id }} className="rounded-xs text-body font-semibold text-ink hover:underline focus-visible:outline-2 focus-visible:outline-pill">{c.name}</PeekLink>
        <p className="text-small text-ink-2"><span className="font-medium text-bad">{local ? 'Local AI not running.' : `${STATUS[c.status].label}.`}</span> {local ? <Cmd text={problem ?? ''} /> : problem}{last}</p>
      </div>
      {local ? <RecheckLocalAi variant="primary" /> : c.oauth && c.status !== 'setup' ? (
        <a href={`/api/oauth/${c.id}/start`} className={buttonClass({ variant: 'primary', size: 'md' })}><LogIn className="size-4" strokeWidth={2} aria-hidden />{fixLabel(c)}</a>
      ) : manage(c, <Button variant="primary">{fixLabel(c)}</Button>)}
    </div>
  )
}

function SourceRow({ c }: { c: ConnectorItem }) {
  const st = STATUS[c.status]
  const first = !c.lastSync
  const n = synced(c)
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-3 py-2.5 md:grid-cols-[minmax(0,1fr)_120px_120px_96px_88px]">
      <span className="flex min-w-0 items-center gap-3 max-md:contents">
        <Logo id={c.id} category={c.category} size="sm" />
        <span className="min-w-0 max-md:col-start-2">
          <PeekLink to={{ type: 'connector', id: c.id }} className="block truncate rounded-xs text-body font-medium text-ink hover:underline focus-visible:outline-2 focus-visible:outline-pill">{c.name}</PeekLink>
          <span className="block truncate text-caption text-ink-3 md:hidden">{first ? c.statusLabel ?? st.label : `${c.lastSync}${n ? ` · ${fmt(n)} items` : ''}`}</span>
        </span>
      </span>
      <span className="flex items-center gap-1.5 text-small text-ink-2 max-md:col-start-3 max-md:row-start-1 max-md:justify-self-end">
        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: st.color }} />
        <span className="max-md:sr-only">{first ? 'Starting' : 'Healthy'}</span>
      </span>
      <span className="hidden text-small text-ink-2 tabular-nums md:block">
        {c.lastSync ?? 'not yet'}
        {c.cadence ? <span className="block text-caption text-ink-3">{c.cadence}</span> : null}
      </span>
      <span className="hidden text-end text-small text-ink-2 tabular-nums md:block" title="Items from the last syncs">{n ? fmt(n) : '–'}</span>
      <span className="hidden justify-end md:flex"><SyncButton id={c.id} name={c.name} compact /></span>
    </li>
  )
}

/** Up to four unconnected sources for the user's areas. A username-only one carries its own field; the rest open the connect dialog. */
export function SuggestedForYou({ items, areas, manage }: { items: ConnectorItem[]; areas?: string[]; manage: Manage }) {
  // Picked once when the page opens: a source connected here stays in place to show its "Connected" line,
  // instead of the refresh removing it before the success state can draw.
  const [ids] = useState(() => items
    .filter((c) => !c.connected && !c.unavailable && isData(c) && c.category && (!areas?.length || areas.includes(c.category)))
    .sort((a, b) => Number(isInline(b)) - Number(isInline(a)) || a.name.localeCompare(b.name))
    .slice(0, 4).map((c) => c.id))
  const picks = ids.flatMap((id) => items.filter((c) => c.id === id))
  if (!picks.length) return null
  return (
    <section aria-labelledby="suggested" className="flex flex-col gap-3">
      <div className="px-1">
        <h2 id="suggested" className="text-heading text-ink">Suggested for your areas</h2>
        <p className="text-small text-ink-3">Not connected yet. Each one adds numbers to the areas you picked.</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {picks.map((c) => (
          <li key={c.id} className="flex min-w-0 flex-col gap-3 rounded-lg bg-surface p-4 shadow-1">
            <div className="flex items-center gap-3">
              <Logo id={c.id} category={c.category} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-body font-semibold text-ink">{c.name}</p>
                <p className="truncate text-caption text-ink-3">{c.category ? CATEGORY[c.category].label : ''}</p>
              </div>
            </div>
            <p className="line-clamp-2 text-small text-ink-2">{c.description}</p>
            <ul aria-label="Adds" className="flex flex-wrap gap-1.5">{c.provides.slice(0, 3).map((p) => <li key={p} className="inline-flex h-6 items-center rounded-full px-2 text-caption text-ink-2 shadow-[inset_0_0_0_1px_var(--hairline)]">{p}</li>)}</ul>
            <div className="mt-auto">{isInline(c) ? <InlineUsernameConnect c={c} /> : c.connected
              ? <p role="status" className="flex min-h-10 items-center gap-2 text-small font-medium text-good"><CircleCheck className="size-4" strokeWidth={2} aria-hidden />Connected</p>
              : manage(c, <Button variant="secondary" className="w-full">Connect</Button>)}</div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** One field and Connect: the connector checks the username before it is saved, and says so if it can't find it. */
export function InlineUsernameConnect({ c }: { c: ConnectorItem }) {
  const f = c.fields[0]
  const [state, action, pending] = useActionState(connectIntegration.bind(null, c.id), null)
  const [, startSubmit] = useTransition()
  const toast = useToast()
  const id = useId()
  const failed = !!state && !state.ok
  const ok = !!state?.ok
  useEffect(() => {
    if (ok) toast(`${c.name} connected`, 'good', { icon: <Logo id={c.id} category={c.category} size="xs" />, description: 'Its first sync starts within a minute' })
  }, [ok]) // eslint-disable-line react-hooks/exhaustive-deps -- once per success
  if (ok) {
    return <p role="status" className="flex min-h-10 items-center gap-2 text-small font-medium text-good"><CircleCheck className="size-4" strokeWidth={2} aria-hidden />Connected. First sync starting…</p>
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); startSubmit(() => action(data)) }} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <label htmlFor={id} className="sr-only">{f.label}</label>
        <Input
          id={id} name={f.env} required autoComplete="off" spellCheck={false} maxLength={200} placeholder={f.label} aria-invalid={failed || undefined}
          className={cn('h-10 min-w-0 flex-1 font-mono text-small', failed && 'shadow-[0_0_0_1.5px_var(--bad)]')}
        />
        <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Checking…' : failed ? 'Check again' : 'Connect'}</Button>
      </div>
      {failed ? <FormError message={state.error} /> : null}
    </form>
  )
}

/** Step 3 of connecting: it is saved. Where the numbers will show up, and what the first sync is doing. */
export function ConnectSuccess({ c, onDone }: { c: ConnectorItem; onDone: () => void }) {
  // The People area lives at /people while its category is `relationships`.
  const area = c.category ? { href: c.category === 'relationships' ? '/people' : `/${c.category}`, title: CATEGORY[c.category].label } : null
  const rows = [
    ...(area ? [{ href: area.href, label: `Life › ${area.title}`, what: c.provides.slice(0, 3).join(', ') || 'Overview', when: 'After the first sync' }] : []),
    { href: '/plan/trackers', label: 'Plan › Trackers', what: 'Every number as a tile', when: 'After the first sync' },
  ]
  return (
    <div role="status" className="flex flex-col gap-4">
      <p className="flex items-center gap-2 text-heading text-ink"><span className="grid size-6 place-items-center rounded-full bg-good/15 text-good"><Check className="size-4" strokeWidth={2.5} aria-hidden /></span>{c.name} connected</p>
      <p className="text-small text-ink-2">The first sync runs in the background, so you can close this. {c.statusLabel ?? 'It starts within a minute.'}</p>
      <div>
        <h3 className="mb-2 font-mono text-label text-ink-3 uppercase">What you’ll see and where</h3>
        <ul className="flex flex-col divide-y divide-divider rounded-md bg-surface-2/60 shadow-[inset_0_0_0_1px_var(--hairline)]">
          {rows.map((r) => (
            <li key={r.href}>
              <a href={r.href} className="flex min-h-12 items-center gap-3 px-3 py-2 text-start hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-pill">
                <span className="min-w-0 flex-1"><span className="block text-body font-medium text-ink">{r.label}</span><span className="block truncate text-caption text-ink-3">{r.what}</span></span>
                <span className="shrink-0 text-caption text-ink-3">{r.when}</span>
                <ArrowUpRight className="size-4 shrink-0 text-ink-3" strokeWidth={1.5} aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex justify-end"><Button variant="primary" onClick={onDone}>Done</Button></div>
    </div>
  )
}
