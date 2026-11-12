'use client'

import { Command } from 'cmdk'
import { useState } from 'react'
import { ArrowRight, ArrowUpRight, Frown, Laugh, LoaderCircle, Meh, Annoyed, Plus, Smile, Sparkles, Wallet, type LucideIcon } from 'lucide-react'
import { amountText, previewQuickLog, type Bucket, type CapturePayload } from '@/domain/capture'
import { formatMoney } from '@/domain/money'
import { parseQuickLog } from '@/domain/quicklog'
import { cn } from '../../cn'
import { routineIcon } from '../../routine-icons'
import { CATEGORY } from '../../tokens'
import { Skeleton } from '../card'
import { PAGES } from './pages'

// What Capture shows, with no state of its own besides the spent form: the same view fills the desktop palette
// and the phone sheet (`layout`), and /dev/ui renders it from fixtures. Doing things is the caller's job
// (`CaptureActions`), so this file never touches the server or the toast.

type Due = CapturePayload['due'][number]
type Goal = CapturePayload['goals'][number]

export type CaptureActions = {
  /** The key of the action in flight (a row or button), or null. Everything is disabled while one runs. */
  busy: string | null
  checkOff: (r: Due) => void
  addStep: (g: Goal) => void
  /** Quick-log `text` (“mood 4”, “drink-water 250”). `key` names the row for the busy state. */
  log: (text: string, key: string) => void
  ask: (text: string) => void
  go: (href: string) => void
  retry: () => void
}

const MOODS: { v: number; label: string; icon: LucideIcon }[] = [
  { v: 1, label: 'Rough', icon: Frown }, { v: 2, label: 'Low', icon: Annoyed }, { v: 3, label: 'Okay', icon: Meh }, { v: 4, label: 'Good', icon: Smile }, { v: 5, label: 'Great', icon: Laugh },
]
const BUCKET_LABEL: Record<Bucket, string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', night: 'Night' }
const ASK_SUGGESTION: Record<Bucket, string> = {
  morning: 'How did I sleep this week?', afternoon: 'What should I focus on today?', evening: 'How did today go?', night: 'What went well this week?',
}

/** Every word typed appears somewhere in the row's text. */
const matches = (typed: string, ...fields: (string | undefined)[]) => {
  const hay = fields.filter(Boolean).join(' ').toLowerCase()
  return typed.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w))
}

export function CaptureView({ layout, data, status, value, onValue, actions, onClose, autoFocus = true }: {
  layout: 'palette' | 'sheet'
  data: CapturePayload | null
  status: 'loading' | 'ready' | 'error'
  value: string
  onValue: (v: string) => void
  actions: CaptureActions
  onClose: () => void
  autoFocus?: boolean
}) {
  const typed = value.trim()
  const q = typed ? parseQuickLog(typed) : null
  const { busy } = actions
  // Enter on a freshly opened, empty Capture does nothing: it never checks something off by accident. Arrow keys
  // or the pointer arm it, and typing arms it.
  const [armed, setArmed] = useState(false)
  const arm = () => setArmed(true)
  const sheet = layout === 'sheet'
  const submit = () => { if (!typed) return; if (q) actions.log(typed, 'typed'); else actions.ask(typed) }

  const input = (
    <Command.Input
      autoFocus={autoFocus}
      value={value}
      onValueChange={onValue}
      disabled={busy === 'typed'}
      aria-label="Log, check off or ask"
      placeholder={sheet ? 'Type “water 250” or ask…' : 'Log, check off or ask…  try “water 250”, “mood 4”, “spent 120 chai”'}
      className={cn(
        'w-full bg-transparent text-ink outline-none placeholder:text-ink-3',
        sheet ? 'h-12 rounded-full bg-surface-2 ps-4 pe-14 text-body focus-visible:outline-2 focus-visible:outline-pill' : 'h-16 text-heading font-normal',
      )}
    />
  )

  return (
    <Command
      label="Capture"
      loop
      shouldFilter={false}
      data-armed={armed || !!typed}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { onClose(); return }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') arm()
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          // ⌘↵ always asks. A bare ↵ with nothing typed and nothing chosen does nothing.
          if ((e.metaKey || e.ctrlKey) && typed) { e.preventDefault(); actions.ask(typed) } else if (!typed && !armed) e.preventDefault()
        }
      }}
      onPointerMove={arm}
      className={cn('group/cap flex flex-col', sheet ? '-mb-6 min-h-full' : 'overflow-hidden rounded-lg bg-surface shadow-3')}
    >
      {sheet ? null : (
        <div className="flex items-center gap-3 px-6">
          <Plus className="size-5 shrink-0 text-ink-2" strokeWidth={1.75} aria-hidden />
          {input}
          <Kbd>esc</Kbd>
        </div>
      )}

      <Command.List className={cn('overscroll-contain p-2 scroll-py-2', sheet ? 'flex-1' : 'max-h-[min(520px,calc(100dvh-84px-120px))] overflow-y-auto border-t border-divider')}>
        {typed ? (
          <TypedRows value={typed} q={q} data={data} actions={actions} />
        ) : (
          <EmptyRows data={data} status={status} actions={actions} sheet={sheet} />
        )}
        <GoTo typed={typed} actions={actions} />
        {typed ? (
          <Command.Group heading="Ask" className={groupClass}>
            <Row value={`ask ${typed}`} onSelect={() => actions.ask(typed)} icon={<Sparkles />} color="var(--cat-mind)" title={<>Ask your coach: “<span className="text-ink">{typed}</span>”</>} sub="Answers from your data, in Coach" trail={<Kbd>⌘↵</Kbd>} enter={false} />
          </Command.Group>
        ) : null}
      </Command.List>

      {sheet ? (
        <form
          onSubmit={(e) => { e.preventDefault(); submit() }}
          className="sticky bottom-0 -mx-4 bg-surface px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-[0_-1px_0_var(--divider)]"
        >
          <div className="relative">
            {input}
            <button
              type="submit" aria-label={q ? 'Log' : 'Ask your coach'} disabled={!typed || !!busy}
              className="absolute top-1 right-1 grid size-10 place-items-center rounded-full bg-pill text-white transition-[opacity,scale] duration-150 ease-out-quint active:scale-96 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill"
            >
              {busy === 'typed' ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ArrowRight className="size-5" strokeWidth={2} aria-hidden />}
            </button>
          </div>
          <p className="mt-2 text-caption text-ink-3">Logs like “mood 4” or “spent 120 chai” save at once. Anything else goes to Ask.</p>
        </form>
      ) : (
        <div className="flex items-center gap-4 border-t border-divider px-6 py-3 text-caption whitespace-nowrap text-ink-3">
          <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd>move</span>
          <span className="flex items-center gap-1.5"><Kbd>↵</Kbd>{q ? 'log' : 'do it'}</span>
          <span className="flex items-center gap-1.5"><Kbd>⌘↵</Kbd>ask instead</span>
          <span className="ms-auto min-w-0 truncate">Anything that is not a log becomes a question for your coach</span>
        </div>
      )}
    </Command>
  )
}

/** Before typing: due now, quick log, mood, spent, and on a phone a suggested question. */
function EmptyRows({ data, status, actions, sheet }: { data: CapturePayload | null; status: 'loading' | 'ready' | 'error'; actions: CaptureActions; sheet: boolean }) {
  if (!data) return status === 'error' ? <LoadError onRetry={actions.retry} /> : <LoadingRows />
  const { busy } = actions
  const quick = data.goals.length + data.frequent.length > 0
  return (
    <>
      {data.due.length ? (
        <Command.Group heading={<span className="flex items-center justify-between"><span>Due now</span><span className="font-sans text-caption font-normal tracking-normal normal-case">{BUCKET_LABEL[data.bucket]}</span></span>} className={groupClass}>
          {data.due.map((r) => {
            const missed = r.status === 'missed'
            return (
              <Row
                key={`${r.scheduleId}|${r.occurrence}`} value={`due ${r.name} ${r.occurrence}`} disabled={!!busy}
                onSelect={() => actions.checkOff(r)}
                icon={<RowIcon name={r.name} kind={r.kind} area={r.area} />} color={CATEGORY[r.area].color}
                title={r.name} sub={missed ? `Overdue since ${r.time}` : `Due ${r.time}`} subTone={missed ? 'bad' : undefined}
                trail={
                  <>
                    {r.xp ? <XpChip xp={r.xp} /> : null}
                    <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full border-2" style={{ borderColor: missed ? 'var(--bad)' : CATEGORY[r.area].color }}>
                      {busy === `due:${r.scheduleId}|${r.occurrence}` ? <LoaderCircle className="size-3.5 animate-spin text-ink-3" /> : null}
                    </span>
                  </>
                }
                enter={false}
                label={`Check off ${r.name}`}
              />
            )
          })}
        </Command.Group>
      ) : null}

      {quick ? (
        <Command.Group heading="Quick log" className={cn(groupClass, chipsClass)}>
          {data.goals.map((g) => (
            <Pill
              key={g.scheduleId} value={`goal ${g.name}`} disabled={!!busy} busy={busy === `goal:${g.scheduleId}`} onSelect={() => actions.addStep(g)}
              icon={<RowIcon name={g.name} kind="routine" area={g.area} />} color={g.slug === 'water' ? 'var(--pill)' : CATEGORY[g.area].color}
              label={`${g.name} +${amountText(g.step, g.unit)}`} detail={`${amountText(g.value, g.unit)} of ${amountText(g.target, g.unit)}`}
            />
          ))}
          {data.frequent.map((f) => (
            <Pill
              key={f.slug} value={`frequent ${f.name}`} disabled={!!busy} busy={busy === `log:${f.slug}`} onSelect={() => actions.log(`${f.slug} ${f.typical}`, `log:${f.slug}`)}
              icon={<RowIcon name={f.name} kind="routine" area={f.area} />} color={CATEGORY[f.area].color}
              label={`${f.name} +${amountText(f.typical, f.unit)}`}
            />
          ))}
        </Command.Group>
      ) : null}

      {data.moodToday === null ? (
        <section aria-label="How do you feel?" className="px-3 pb-1">
          <GroupHeading>How do you feel?</GroupHeading>
          <div role="group" className="grid grid-cols-5 gap-2">
            {MOODS.map((m) => (
              <button
                key={m.v} type="button" disabled={!!busy} onClick={() => actions.log(`mood ${m.v}`, `mood:${m.v}`)}
                className="flex h-16 flex-col items-center justify-center gap-1 rounded-md bg-surface-2 text-small text-ink-2 transition-[background-color,color,scale] duration-150 ease-out-quint hover:bg-surface-3 hover:text-ink active:scale-96 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill"
              >
                {busy === `mood:${m.v}` ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <m.icon className="size-5 text-pill-ink" strokeWidth={1.5} aria-hidden />}
                {m.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <SpendForm data={data} actions={actions} />

      {sheet ? (
        <Command.Group heading="Ask" className={groupClass}>
          <Row value="ask suggested" onSelect={() => actions.ask(ASK_SUGGESTION[data.bucket])} icon={<Sparkles />} color="var(--cat-mind)" title={ASK_SUGGESTION[data.bucket]} sub="Suggested from today · answers in Coach" trail={<ArrowRight className="size-4 text-ink-3" aria-hidden />} enter={false} />
        </Command.Group>
      ) : null}
    </>
  )
}

/** Typed: the log it reads as, an Open row for that tracker, routines whose name matches, then (below) Ask. */
function TypedRows({ value, q, data, actions }: { value: string; q: ReturnType<typeof parseQuickLog>; data: CapturePayload | null; actions: CaptureActions }) {
  const { busy } = actions
  const preview = q ? previewQuickLog(q, data?.trackers ?? [], data?.goals ?? []) : null
  const due = (data?.due ?? []).filter((r) => matches(value, r.name))
  const tracker = preview?.slug ? data?.trackers.find((t) => t.slug === preview.slug) : undefined
  return (
    <>
      {q && preview ? (
        <Command.Group heading="Log" className={groupClass}>
          <Row
            value={`log ${value}`} disabled={!!busy} onSelect={() => actions.log(value, 'typed')}
            icon={q.type === 'spend' ? <Wallet /> : <Plus />} color={q.type === 'spend' ? 'var(--cat-wealth)' : 'var(--pill)'}
            title={preview.title} sub={busy === 'typed' ? 'Saving…' : preview.sub}
            trail={busy === 'typed' ? <LoaderCircle className="size-4 animate-spin text-ink-3" aria-hidden /> : undefined}
          />
        </Command.Group>
      ) : null}
      {!q && due.length ? (
        <Command.Group heading="Check off" className={groupClass}>
          {due.map((r) => (
            <Row
              key={`${r.scheduleId}|${r.occurrence}`} value={`due ${r.name} ${r.occurrence}`} disabled={!!busy} onSelect={() => actions.checkOff(r)}
              icon={<RowIcon name={r.name} kind={r.kind} area={r.area} />} color={CATEGORY[r.area].color}
              title={r.name} sub={r.status === 'missed' ? `Overdue since ${r.time}` : `Due ${r.time}`} subTone={r.status === 'missed' ? 'bad' : undefined}
              trail={r.xp ? <XpChip xp={r.xp} /> : undefined}
            />
          ))}
        </Command.Group>
      ) : null}
      {tracker ? (
        <Command.Group heading="Open" className={groupClass}>
          <Row value={`open ${tracker.slug}`} onSelect={() => actions.go(`/plan/trackers/${encodeURIComponent(tracker.slug)}`)} icon={<ArrowUpRight />} title={tracker.name} sub="Tracker · trend, log and target" trail={<ArrowUpRight className="size-4 text-ink-3" aria-hidden />} enter={false} />
        </Command.Group>
      ) : null}
    </>
  )
}

function GoTo({ typed, actions }: { typed: string; actions: CaptureActions }) {
  const pages = typed ? PAGES.filter((p) => matches(typed, p.label, p.parent, p.sub)) : PAGES
  if (!pages.length) return null
  return (
    <Command.Group heading="Go to" className={groupClass}>
      {pages.map((p) => (
        <Row
          key={p.href} value={`go ${p.parent ?? ''} ${p.label}`} onSelect={() => actions.go(p.href)}
          icon={<p.icon />} color={p.color}
          title={p.parent ? <><span className="text-ink-3">{p.parent} ›</span> {p.label}</> : p.label} sub={p.sub}
        />
      ))}
    </Command.Group>
  )
}

function SpendForm({ data, actions }: { data: CapturePayload; actions: CaptureActions }) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const { busy } = actions
  const symbol = formatMoney(0, data.currency, { decimals: 0 }).replace(/[\d.,\s]/g, '')
  const ok = Number(amount) > 0
  const submit = () => {
    if (!ok || busy) return
    // The grammar assumes ₹; another base currency says so by code (“spent 12 USD lunch”).
    actions.log(`spent ${Number(amount)}${data.currency === 'INR' ? '' : ` ${data.currency}`} ${note.trim()}`.trim(), 'spend')
  }
  // Enter in these fields logs the spend; cmdk would otherwise treat it as "choose the highlighted row".
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return
    e.stopPropagation()
    if (e.key === 'Enter') { e.preventDefault(); submit() }
  }
  return (
    <section aria-label="Spent" className="px-3 pb-1">
      <GroupHeading>Spent</GroupHeading>
      <div className="flex gap-2">
        <label className="relative block w-32 shrink-0">
          <span className="sr-only">Amount</span>
          <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-body text-ink-3">{symbol}</span>
          <input
            inputMode="decimal" value={amount} placeholder="Amount" onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} onKeyDown={keys} disabled={!!busy}
            className={cn(fieldClass, 'ps-7 tabular-nums')}
          />
        </label>
        <label className="block min-w-0 flex-1">
          <span className="sr-only">What for</span>
          <input value={note} maxLength={60} placeholder="On what? chai, auto…" onChange={(e) => setNote(e.target.value)} onKeyDown={keys} disabled={!!busy} className={cn(fieldClass, 'px-3')} />
        </label>
        <button
          type="button" disabled={!ok || !!busy} onClick={submit}
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-md bg-ink px-5 text-body font-semibold text-bg transition-[opacity,scale] duration-150 ease-out-quint active:scale-96 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill"
        >
          {busy === 'spend' ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : 'Log'}
        </button>
      </div>
      {data.spend.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {data.spend.map((s) => (
            <button
              key={`${s.note}|${s.currency}`} type="button" disabled={!!busy}
              onClick={() => actions.log(`spent ${s.amount}${s.currency === 'INR' ? '' : ` ${s.currency}`} ${s.note}`, `spend:${s.note}`)}
              className={pillClass}
            >
              <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-3 text-ink-2 [&_svg]:size-3.5"><Wallet strokeWidth={1.75} /></span>
              {busy === `spend:${s.note}` ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
              <span className="font-medium text-ink">{s.note}</span>
              <span className="text-ink-3 tabular-nums">{formatMoney(s.amount, s.currency, { decimals: 0 })}</span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function LoadingRows() {
  return (
    <div role="status" aria-label="Loading suggestions" className="space-y-4 px-3 py-3">
      <Skeleton className="h-12 w-full rounded-md" />
      <Skeleton className="h-12 w-full rounded-md" />
      <div className="flex gap-2"><Skeleton className="h-10 w-36 rounded-full" /><Skeleton className="h-10 w-32 rounded-full" /></div>
    </div>
  )
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-4 text-small text-ink-3">
      <span>Couldn’t load suggestions. You can still type a log or a question.</span>
      <button type="button" onClick={onRetry} className="h-10 shrink-0 rounded-md px-3 font-medium text-pill-ink hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-pill">Retry</button>
    </div>
  )
}

/** Icon in a small tinted tile: the area colour, or neutral for app pages. */
function Tile({ color, children }: { color?: string; children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className="grid size-10 shrink-0 place-items-center rounded-sm [&_svg]:size-5 [&_svg]:stroke-[1.75]"
      style={color ? { color: `color-mix(in oklch, ${color} 80%, var(--ink))`, background: `color-mix(in oklch, ${color} 15%, transparent)` } : { color: 'var(--ink-2)', background: 'var(--surface-2)' }}
    >
      {children}
    </span>
  )
}

function RowIcon({ name, kind, area }: { name: string; kind: string; area: string }) {
  const Icon = routineIcon(name, kind, area)
  return <Icon />
}

function Row({ value, onSelect, disabled, icon, color, title, sub, subTone, trail, enter = true, label }: {
  value: string; onSelect: () => void; disabled?: boolean; icon: React.ReactNode; color?: string
  title: React.ReactNode; sub?: string; subTone?: 'bad'; trail?: React.ReactNode
  /** Show ↵ on the highlighted row (a keyboard hint). */
  enter?: boolean; label?: string
}) {
  return (
    <Command.Item
      value={value} onSelect={onSelect} disabled={disabled} aria-label={label}
      className="group/item flex min-h-14 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 data-[disabled=true]:opacity-50 group-data-[armed=true]/cap:data-[selected=true]:bg-surface-2"
    >
      <Tile color={color}>{icon}</Tile>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-medium text-ink">{title}</span>
        {sub ? <span className={cn('block truncate text-caption', subTone === 'bad' ? 'text-bad' : 'text-ink-3')}>{sub}</span> : null}
      </span>
      {trail}
      {enter ? <Kbd className="opacity-0 transition-[opacity] duration-150 group-data-[selected=true]/item:group-data-[armed=true]/cap:opacity-100 max-lg:hidden">↵</Kbd> : null}
    </Command.Item>
  )
}

function Pill({ value, onSelect, disabled, busy, icon, color, label, detail }: {
  value: string; onSelect: () => void; disabled?: boolean; busy?: boolean; icon: React.ReactNode; color: string; label: string; detail?: string
}) {
  return (
    <Command.Item value={value} onSelect={onSelect} disabled={disabled} className={cn(pillClass, 'cursor-pointer data-[disabled=true]:opacity-50 group-data-[armed=true]/cap:data-[selected=true]:bg-surface-3')}>
      <span
        aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full [&_svg]:size-3.5 [&_svg]:stroke-[1.75]"
        style={{ color: `color-mix(in oklch, ${color} 80%, var(--ink))`, background: `color-mix(in oklch, ${color} 15%, transparent)` }}
      >
        {busy ? <LoaderCircle className="animate-spin" /> : icon}
      </span>
      <span className="font-medium text-ink">{label}</span>
      {detail ? <span className="text-ink-3 tabular-nums">{detail}</span> : null}
    </Command.Item>
  )
}

function XpChip({ xp }: { xp: number }) {
  return (
    <span
      className="inline-flex h-6 shrink-0 items-center rounded-full px-2 text-caption font-semibold tabular-nums max-sm:hidden"
      style={{ color: 'color-mix(in oklch, var(--medal-gold) 80%, var(--ink))', background: 'color-mix(in oklch, var(--medal-gold) 12%, transparent)' }}
    >
      +{xp} XP
    </span>
  )
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="pt-3 pb-1.5 text-label font-mono text-ink-3 uppercase">{children}</h3>
}

function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return <kbd className={cn('inline-grid h-5 min-w-5 place-items-center rounded-xs bg-surface-2 px-1.5 text-caption font-medium text-ink-3 shadow-[inset_0_0_0_1px_var(--hairline)]', className)}>{children}</kbd>
}

const groupClass = '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-label [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-ink-3 [&_[cmdk-group-heading]]:uppercase'
const chipsClass = '[&_[cmdk-group-items]]:flex [&_[cmdk-group-items]]:flex-wrap [&_[cmdk-group-items]]:gap-2 [&_[cmdk-group-items]]:px-3'
const pillClass = 'inline-flex h-10 items-center gap-2 rounded-full bg-surface-2 ps-2 pe-3.5 text-small transition-[background-color,scale] duration-150 ease-out-quint hover:bg-surface-3 active:scale-96 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill'
const fieldClass = 'h-11 w-full rounded-md bg-surface-2 text-body text-ink outline-none placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-pill disabled:opacity-50'
