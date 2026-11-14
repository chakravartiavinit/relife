'use client'

import { Bookmark, Calendar, Check, CircleAlert, FileSpreadsheet, FileText, Landmark, Link2, Lock, Table2, TriangleAlert, type LucideIcon } from 'lucide-react'
import { HeartPulse, Package } from 'lucide-react'
import { DATE_FORMATS } from '@/domain/csv'
import {
  KIND_LABEL, type ImportKind, type ImportSummary, type StatementPreview, type TrackerCsvPreview, type ZipPreview,
} from '@/domain/imports'
import { formatMoney } from '@/domain/money'
import type { StatementMapping } from '@/domain/statement'
import type { TrackerCsvMapping } from '@/domain/tracker-csv'
import { Capsule } from '../capsule'
import { Input, Segmented, Select } from '../form'
import { cn } from '../../cn'

// The parts of the import dialog (import-dialog.tsx) and of Past imports (import-history.tsx), without any data
// fetching, so /dev/ui can draw every state from fixtures. Tokens only; light and dark follow the theme.

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
/** "3 Oct 2026" from "2026-10-03". */
export const fmtDay = (d?: string) => (d ? DAY.format(new Date(`${d}T00:00:00Z`)) : '')
export const fmtSize = (bytes: number) => (bytes >= 1048576 ? `${+(bytes / 1048576).toFixed(bytes >= 1073741824 ? 0 : 1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)
const nf = new Intl.NumberFormat('en-US')

const KIND: Record<ImportKind, { icon: LucideIcon; ext: string; blurb: string; accept: string; tint: string }> = {
  statement: { icon: Landmark, ext: '.csv', blurb: 'Spending and income from any bank. Map the columns once.', accept: '.csv,.txt,text/csv', tint: 'var(--cat-wealth)' },
  'apple-health': { icon: HeartPulse, ext: 'export.zip', blurb: 'Steps, sleep, heart rate and weight by day. Health app › your photo › Export All Health Data.', accept: '.zip,application/zip', tint: 'var(--cat-health)' },
  takeout: { icon: Package, ext: '.zip', blurb: 'Google Fit daily activity and YouTube watch history.', accept: '.zip,application/zip', tint: 'var(--cat-skills)' },
  'tracker-csv': { icon: Table2, ext: '.csv', blurb: 'Columns date, metric, value. Back-fill anything you log by hand.', accept: '.csv,.txt,text/csv', tint: 'var(--cat-mind)' },
}
export const ACCEPT = (k: ImportKind) => KIND[k].accept
export const KIND_ICON = (k: ImportKind) => KIND[k].icon
export const KIND_TINT = (k: ImportKind) => KIND[k].tint

/** A tinted square with the kind's icon, like the area chips elsewhere. */
export function KindChip({ kind, className }: { kind: ImportKind; className?: string }) {
  const { icon: Icon, tint } = KIND[kind]
  return (
    <span aria-hidden className={cn('grid size-9 shrink-0 place-items-center rounded-[10px]', className)}
      style={{ color: `color-mix(in oklch, ${tint} 80%, var(--ink))`, background: `color-mix(in oklch, ${tint} 14%, transparent)` }}>
      <Icon className="size-[18px]" strokeWidth={1.5} />
    </span>
  )
}

// ── The three steps ──────────────────────────────────────────────────────────────────────────────────
export const IMPORT_STEPS = ['Pick a file', 'Check columns', 'Done'] as const

/** Three capsules, as in setup: finished ones tick, the one you are on is bold. */
export function ImportRail({ current, labels = IMPORT_STEPS }: { current: 0 | 1 | 2; labels?: readonly string[] }) {
  return (
    <ol aria-label="Import steps" className="grid grid-cols-3 gap-1.5">
      {labels.map((label, k) => {
        const state = k < current ? 'done' : k === current ? 'now' : 'next'
        return (
          <li key={label} aria-current={state === 'now' ? 'step' : undefined} className="flex flex-col gap-2">
            <span className="relative block h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.08] dark:bg-white/[0.1]">
              <span className={cn('absolute inset-0 rounded-full bg-pill transition-[translate] duration-300 ease-[var(--ease-out-strong)] motion-reduce:transition-none', state === 'next' ? '-translate-x-[101%]' : 'translate-x-0')} />
            </span>
            <span className={cn('flex min-w-0 items-center gap-1 text-caption', state === 'now' ? 'font-semibold text-ink' : state === 'done' ? 'text-ink-2' : 'text-ink-3')}>
              {state === 'done' ? <Check aria-hidden className="size-3 shrink-0" strokeWidth={2.5} /> : null}
              <span className="truncate">{label}</span>
              <span className="sr-only">{state === 'done' ? ' (done)' : state === 'now' ? ' (current)' : ''}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

// ── Step 1: what and which file ──────────────────────────────────────────────────────────────────────
export function KindPicker({ kind, onPick, disabled }: { kind: ImportKind; onPick: (k: ImportKind) => void; disabled?: boolean }) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-2 text-small font-semibold text-ink">What are you importing?</legend>
      <div role="radiogroup" aria-label="What are you importing?" className="grid gap-2 sm:grid-cols-2">
        {(Object.keys(KIND) as ImportKind[]).map((k) => {
          const on = k === kind
          return (
            // Concentric: radius 16 card, 12px padding.
            <button key={k} type="button" role="radio" aria-checked={on} onClick={() => onPick(k)}
              className={cn('relative flex items-start gap-3 rounded-[16px] p-3 text-start transition-[background-color,box-shadow,scale] duration-150 ease-out-quint active:scale-[0.98] disabled:opacity-50',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill',
                on ? 'bg-pill-wash shadow-[0_0_0_1.5px_var(--pill)]' : 'bg-surface shadow-1 hover:bg-surface-2')}>
              <KindChip kind={k} />
              <span className="min-w-0 flex-1 pe-6">
                <span className="flex flex-wrap items-center gap-x-2">
                  <span className="text-body font-semibold text-ink">{KIND_LABEL[k]}</span>
                  <code className="rounded-xs bg-surface-2 px-1 font-mono text-label text-ink-2">{KIND[k].ext}</code>
                </span>
                <span className="mt-0.5 block text-caption text-pretty text-ink-3">{KIND[k].blurb}</span>
              </span>
              <span aria-hidden className={cn('absolute end-3 top-3 grid size-5 place-items-center rounded-full', on ? 'bg-pill' : 'shadow-[inset_0_0_0_1.5px_var(--hairline)]')}>
                {on ? <span className="size-2 rounded-full bg-white" /> : null}
              </span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

/** The chosen file: its name, size and (once read) how many rows. */
export function FileRow({ name, size, detail, action, busy }: { name: string; size: number; detail?: string; action?: React.ReactNode; busy?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-[16px] bg-surface-2 p-3">
      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface shadow-1 text-ink-2"><FileText className="size-[18px]" strokeWidth={1.5} /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-small font-semibold text-ink">{name}</span>
        <span className={cn('block truncate text-caption text-ink-3', busy && 'animate-pulse')}>{[fmtSize(size), detail].filter(Boolean).join(' · ')}</span>
      </span>
      {action}
    </div>
  )
}

/** The one-line promise under the file, which says what the import does with duplicates. */
export function Note({ icon: Icon = Link2, children }: { icon?: LucideIcon; children: React.ReactNode }) {
  return <p className="flex items-start gap-2 text-caption text-pretty text-ink-3"><Icon aria-hidden className="mt-px size-3.5 shrink-0" strokeWidth={1.5} />{children}</p>
}

export const PRIVACY = 'Read on this machine. Nothing is uploaded anywhere.'
export function PrivacyLine() {
  return <span className="inline-flex items-center gap-1.5"><Lock aria-hidden className="size-3" strokeWidth={1.5} />{PRIVACY}</span>
}

// ── Step 2: columns ──────────────────────────────────────────────────────────────────────────────────
const NONE = '-1'
const colOptions = (header: string[], none?: string) => [
  ...(none ? [<option key="none" value={NONE}>{none}</option>] : []),
  ...header.map((h, i) => <option key={i} value={String(i)}>{h.trim() || `Column ${i + 1}`}</option>),
]

function Pair({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3">
      <label htmlFor={htmlFor} className="text-small font-medium text-ink">
        {label}
        {hint ? <span className="block text-caption font-normal text-ink-3">{hint}</span> : null}
      </label>
      {children}
    </div>
  )
}

/** Where a file came from: the saved layout of an earlier file with the same columns. */
export function SavedChip() {
  return <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-good/10 px-2 text-label font-medium text-good">Saved mapping</span>
}

export function StatementColumns({ preview, onChange, idBase = 'imp' }: { preview: StatementPreview; onChange: (m: StatementMapping) => void; idBase?: string }) {
  const m = preview.mapping
  const split = m.columns.amount === undefined
  const set = (patch: Partial<StatementMapping['columns']>) => onChange({ ...m, columns: { ...m.columns, ...patch } })
  const pick = (key: keyof StatementMapping['columns']) => (e: { target: { value: string } }) => {
    const n = Number(e.target.value)
    set({ [key]: n < 0 ? undefined : n })
  }
  const col = (k: keyof StatementMapping['columns']) => String(m.columns[k] ?? NONE)
  const example = fmtDay(preview.sample[0]?.date)
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Pair label="Date" htmlFor={`${idBase}-date`}><Select id={`${idBase}-date`} value={col('date')} onChange={(e) => set({ date: Number(e.target.value) })}>{colOptions(preview.header)}</Select></Pair>
        <Pair label="Amount" htmlFor={`${idBase}-amount`}>
          <Select id={`${idBase}-amount`} value={split ? 'split' : col('amount')}
            onChange={(e) => (e.target.value === 'split'
              ? onChange({ ...m, columns: { ...m.columns, amount: undefined, debit: m.columns.debit ?? 0, credit: m.columns.credit ?? 0 } })
              : set({ amount: Number(e.target.value), debit: undefined, credit: undefined }))}>
            <option value="split">Separate debit and credit</option>
            {colOptions(preview.header)}
          </Select>
        </Pair>
        <Pair label="Description" htmlFor={`${idBase}-desc`}><Select id={`${idBase}-desc`} value={col('description')} onChange={(e) => set({ description: Number(e.target.value) })}>{colOptions(preview.header)}</Select></Pair>
        {split ? (
          <>
            <Pair label="Debit" hint="money out" htmlFor={`${idBase}-debit`}><Select id={`${idBase}-debit`} value={col('debit')} onChange={pick('debit')}>{colOptions(preview.header, 'None')}</Select></Pair>
            <Pair label="Credit" hint="money in" htmlFor={`${idBase}-credit`}><Select id={`${idBase}-credit`} value={col('credit')} onChange={pick('credit')}>{colOptions(preview.header, 'None')}</Select></Pair>
          </>
        ) : null}
        <Pair label="Balance" hint="optional" htmlFor={`${idBase}-bal`}><Select id={`${idBase}-bal`} value={col('balance')} onChange={pick('balance')}>{colOptions(preview.header, 'None')}</Select></Pair>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[16px] bg-pill-wash p-3">
        <Calendar aria-hidden className="size-4 shrink-0 text-pill-ink" strokeWidth={1.5} />
        <p className="min-w-0 flex-1 basis-56 text-small text-ink">
          Dates read as <strong className="font-semibold">{m.dateFormat}</strong>
          {example ? <span className="text-ink-2"> · first row is {example}</span> : null}
        </p>
        <div className="w-40 shrink-0">
          <Select aria-label="Date format" variant="field" value={m.dateFormat} onChange={(e) => onChange({ ...m, dateFormat: e.target.value })}>
            {(preview.dateChoices.length ? preview.dateChoices.map((c) => c.format) : [...DATE_FORMATS]).map((f) => <option key={f} value={f}>{f}</option>)}
          </Select>
        </div>
        {preview.dateChoices.length ? (
          <p className="basis-full ps-7 text-caption text-ink-2">
            More than one reading fits: {preview.dateChoices.map((c) => `${c.format} → ${fmtDay(c.example)}`).join(' · ')}. Pick the one that matches your bank.
          </p>
        ) : null}
      </div>

      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Pair label="Account" htmlFor={`${idBase}-acct`}>
          <Input id={`${idBase}-acct`} value={m.account.name} maxLength={60} onChange={(e) => onChange({ ...m, account: { ...m.account, name: e.target.value } })} />
        </Pair>
        <div className="flex items-center gap-3">
          <Segmented name={`${idBase}-kind`} aria-label="Account kind" value={m.account.kind} onValueChange={(v) => onChange({ ...m, account: { ...m.account, kind: v as 'bank' | 'card' } })}
            options={[{ value: 'bank', label: 'Bank' }, { value: 'card', label: 'Card' }]} />
          <Input aria-label="Currency" value={m.currency} maxLength={3} onChange={(e) => onChange({ ...m, currency: e.target.value.toUpperCase() })} className="w-16 text-center uppercase" />
        </div>
      </div>
      <label className="flex items-start gap-2.5 text-small text-ink-2">
        <input type="checkbox" checked={m.invert} onChange={(e) => onChange({ ...m, invert: e.target.checked })} className="mt-0.5 size-4 accent-[var(--pill)]" />
        <span>Purchases are positive numbers in this file (flip the signs). Card statements often are.</span>
      </label>
    </div>
  )
}

export function TrackerColumns({ preview, onChange, idBase = 'imp' }: { preview: TrackerCsvPreview; onChange: (m: TrackerCsvMapping) => void; idBase?: string }) {
  const m = preview.mapping
  const set = (patch: Partial<TrackerCsvMapping['columns']>) => onChange({ ...m, columns: { ...m.columns, ...patch } })
  const col = (k: keyof TrackerCsvMapping['columns']) => String(m.columns[k] ?? NONE)
  const names = Object.keys(m.metrics)
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Pair label="Date" htmlFor={`${idBase}-tdate`}><Select id={`${idBase}-tdate`} value={col('date')} onChange={(e) => set({ date: Number(e.target.value) })}>{colOptions(preview.header)}</Select></Pair>
        <Pair label="Layout" htmlFor={`${idBase}-shape`}>
          <Segmented name={`${idBase}-shape`} aria-label="Layout" value={m.shape} onValueChange={(v) => onChange({ ...m, shape: v as 'long' | 'wide' })}
            options={[{ value: 'long', label: 'One row per value' }, { value: 'wide', label: 'One column per metric' }]} />
        </Pair>
        {m.shape === 'long' ? (
          <>
            <Pair label="Metric" htmlFor={`${idBase}-metric`}><Select id={`${idBase}-metric`} value={col('metric')} onChange={(e) => set({ metric: Number(e.target.value) })}>{colOptions(preview.header)}</Select></Pair>
            <Pair label="Value" htmlFor={`${idBase}-value`}><Select id={`${idBase}-value`} value={col('value')} onChange={(e) => set({ value: Number(e.target.value) })}>{colOptions(preview.header)}</Select></Pair>
          </>
        ) : null}
      </div>
      <div className="flex items-center gap-3 rounded-[16px] bg-pill-wash p-3">
        <Calendar aria-hidden className="size-4 shrink-0 text-pill-ink" strokeWidth={1.5} />
        <p className="min-w-0 flex-1 text-small text-ink">Dates read as <strong className="font-semibold">{m.dateFormat}</strong></p>
        <div className="w-40 shrink-0">
          <Select aria-label="Date format" value={m.dateFormat} onChange={(e) => onChange({ ...m, dateFormat: e.target.value })}>
            {(preview.dateChoices.length ? preview.dateChoices.map((c) => c.format) : [...DATE_FORMATS]).map((f) => <option key={f} value={f}>{f}</option>)}
          </Select>
        </div>
      </div>
      {names.length ? (
        <div>
          <h3 className="mb-2 text-small font-semibold text-ink">Feeds these trackers</h3>
          <ul className="divide-y divide-divider rounded-[16px] bg-surface shadow-1">
            {names.map((n) => (
              <li key={n} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-3 px-3 py-2">
                <span className="truncate text-small font-medium text-ink">{n}</span>
                <Select aria-label={`Tracker for ${n}`} value={m.metrics[n].slug}
                  onChange={(e) => onChange({ ...m, metrics: { ...m.metrics, [n]: { ...m.metrics[n], slug: e.target.value } } })}>
                  {preview.trackers.some((t) => t.slug === m.metrics[n].slug) ? null : <option value={m.metrics[n].slug}>New tracker: {m.metrics[n].slug}</option>}
                  {preview.trackers.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
                </Select>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

/** Five rows as they will be read, with what each would do: new, or linked to an app order. */
export function StatementTable({ preview }: { preview: StatementPreview }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-small font-semibold text-ink">Preview</h3>
        <p className="text-caption text-ink-3 tabular-nums">{Math.min(5, preview.sample.length)} of {nf.format(preview.rows)} rows</p>
      </div>
      {preview.sample.length ? (
        <div className="overflow-x-auto rounded-[16px] bg-surface shadow-1">
          <table className="w-full min-w-[34rem] text-start">
            <thead>
              <tr className="font-mono text-label text-ink-3 uppercase">
                <th scope="col" className="px-3 pt-3 pb-1.5 text-start font-normal">Date</th>
                <th scope="col" className="px-3 pt-3 pb-1.5 text-start font-normal">Description</th>
                <th scope="col" className="px-3 pt-3 pb-1.5 text-end font-normal">Amount</th>
                <th scope="col" className="px-3 pt-3 pb-1.5 text-start font-normal">Category</th>
                <th scope="col" className="px-3 pt-3 pb-1.5 text-start font-normal">Match</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {preview.sample.map((r, k) => (
                <tr key={k} className="h-11 text-small">
                  <td className="px-3 whitespace-nowrap text-ink-2">{fmtDay(r.date)}</td>
                  <td title={r.merchant} className="max-w-[9rem] truncate px-3 text-ink">{r.merchant}</td>
                  <td className={cn('px-3 text-end font-semibold whitespace-nowrap tabular-nums', r.amount > 0 ? 'text-good' : 'text-ink')}>{formatMoney(r.amount, preview.mapping.currency, { sign: true })}</td>
                  <td className="px-3 whitespace-nowrap"><span className="inline-flex h-6 items-center rounded-full bg-surface-2 px-2 text-caption text-ink-2">{r.category}</span></td>
                  <td className="px-3 whitespace-nowrap">
                    {r.match
                      ? <span className="inline-flex h-6 items-center gap-1 rounded-full bg-pill-wash px-2 text-caption font-medium text-pill-ink"><Link2 aria-hidden className="size-3" strokeWidth={2} />Linked · {r.match}</span>
                      : <span className="inline-flex h-6 items-center rounded-full bg-surface-2 px-2 text-caption font-medium text-ink-2">New</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="rounded-md bg-surface-2 p-3 text-small text-ink-2">No rows can be read with these columns yet. Check the date and amount.</p>}
      {preview.invalid ? (
        <p className="mt-2 flex items-start gap-2 text-caption text-pretty text-ink-3">
          <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0 text-warn" strokeWidth={1.5} />
          <span>{preview.invalid} row{preview.invalid === 1 ? '' : 's'} skipped (balance lines, totals, blanks)
            {preview.invalidSamples.length ? <>: {preview.invalidSamples.slice(0, 2).join('; ')}</> : null}. Categories come from your merchant rules.</span>
        </p>
      ) : <p className="mt-2 text-caption text-ink-3">Categories come from your merchant rules.</p>}
    </div>
  )
}

export function TrackerTable({ preview }: { preview: TrackerCsvPreview }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-small font-semibold text-ink">Preview</h3>
        <p className="text-caption text-ink-3 tabular-nums">{Math.min(5, preview.sample.length)} of {nf.format(preview.rows)} values</p>
      </div>
      {preview.sample.length ? (
        <ul className="divide-y divide-divider rounded-[16px] bg-surface shadow-1">
          {preview.sample.map((r, k) => (
            <li key={k} className="flex h-11 items-center gap-3 px-3 text-small">
              <span className="w-24 shrink-0 text-ink-2">{fmtDay(r.date)}</span>
              <span className="min-w-0 flex-1 truncate font-medium text-ink">{r.slug}</span>
              <span className="font-semibold text-ink tabular-nums">{nf.format(r.value)}</span>
            </li>
          ))}
        </ul>
      ) : <p className="rounded-md bg-surface-2 p-3 text-small text-ink-2">No values can be read with these columns yet.</p>}
      {preview.invalid ? <p className="mt-2 text-caption text-ink-3">{preview.invalid} row{preview.invalid === 1 ? '' : 's'} skipped{preview.invalidSamples.length ? `: ${preview.invalidSamples.slice(0, 2).join('; ')}` : ''}.</p> : null}
    </div>
  )
}

/** A zip is not mapped: it lists what was found, then Start. */
export function ZipFound({ preview }: { preview: ZipPreview }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-small font-semibold text-ink">Found in this file</h3>
      <ul className="divide-y divide-divider rounded-[16px] bg-surface shadow-1">
        {preview.found.map((f) => (
          <li key={f} className="flex items-center gap-3 px-3 py-2.5 text-small text-ink"><Check aria-hidden className="size-4 shrink-0 text-good" strokeWidth={2.5} />{f}</li>
        ))}
      </ul>
      <Note icon={FileSpreadsheet}>
        {preview.kind === 'apple-health'
          ? 'Days from your iPhone are filled in only where nothing else has them: a Shortcuts day is never replaced.'
          : 'Only Fit daily metrics and your YouTube watch count are read. Nothing else in the Takeout is opened.'}
      </Note>
    </div>
  )
}

// ── Running and done ─────────────────────────────────────────────────────────────────────────────────
export function ImportProgress({ phase, done, total, sub }: { phase: string; done: number; total?: number; sub?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3 py-2">
      <p className="text-body font-semibold text-ink">{phase}…</p>
      <Capsule value={total ? done : 0.35} max={total || 1} label={phase} className={cn(!total && 'animate-pulse')} />
      <p className="text-caption text-ink-3 tabular-nums">{total ? `${nf.format(done)} of ${nf.format(total)}` : sub ?? 'This can take a few minutes for a large file. You can close this window: it keeps running.'}</p>
    </div>
  )
}

const STAT = 'flex min-w-0 flex-col rounded-[16px] bg-surface-2/60 p-3 shadow-[inset_0_0_0_1px_var(--hairline)]'

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'pill' }) {
  return (
    <div className={STAT}>
      <span className="text-caption text-ink-3">{label}</span>
      <span className={cn('font-display text-title tabular-nums', tone === 'pill' ? 'text-pill-ink' : 'text-ink')}>{value}</span>
      <span className="text-caption text-pretty text-ink-3">{sub}</span>
    </div>
  )
}

/** The result: what was added, what matched an app order, what was skipped, and (for a statement) where the money went. */
export function ImportResult({ kind, fileName, summary, currency, account, undone }: {
  kind: ImportKind; fileName: string; summary: ImportSummary; currency: string; account?: string; undone?: boolean
}) {
  const s = summary
  const unit = kind === 'statement' ? 'rows' : 'days'
  const none = !s.added
  const range = s.from && s.to ? `${fmtDay(s.from)} to ${fmtDay(s.to)}` : ''
  const trackers = Object.entries(s.trackers ?? {}).sort((a, b) => b[1] - a[1])
  const linkedBy = Object.entries(s.linkedBy ?? {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · ')
  const top = s.spend?.[0]?.total ?? 0
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <span aria-hidden className={cn('grid size-11 shrink-0 place-items-center rounded-[12px]', undone ? 'bg-surface-2 text-ink-3' : none ? 'bg-surface-2 text-ink-2' : 'bg-good/10 text-good')}><Check className="size-5" strokeWidth={2.5} /></span>
        <div className="min-w-0">
          <h3 className="font-display text-title text-ink">{undone ? 'Import removed' : none ? 'Nothing new in this file' : `${nf.format(s.added)} ${s.added === 1 ? unit.slice(0, -1) : unit} added`}</h3>
          <p className="truncate text-small text-ink-3">{[fileName, range].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      {s.note ? <Note icon={CircleAlert}>{s.note}</Note> : null}
      {none && !undone ? <p className="rounded-md bg-surface-2 p-3 text-small text-ink-2">This file was imported before, or every row was skipped. Nothing changed.</p> : null}
      {!undone && !none ? (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            <Stat label="Added" value={nf.format(s.added)} sub={kind === 'statement' ? 'to Spending and Income' : trackers.length ? trackers.slice(0, 3).map(([k, n]) => `${k} ${n}`).join(' · ') : 'days'} />
            {kind === 'statement'
              ? <Stat label="Linked" value={nf.format(s.linked ?? 0)} tone="pill" sub={linkedBy || 'No app orders matched'} />
              : <Stat label="Already there" value={nf.format(s.duplicates)} sub="days left as they were" />}
            <Stat label="Skipped" value={nf.format(s.invalid)} sub={kind === 'statement' ? 'balance lines and blanks' : 'rows that could not be read'} />
          </div>
          {kind === 'statement' && s.spend?.length ? (
            <div>
              <h4 className="mb-2 text-small font-semibold text-ink">Spending added by this file</h4>
              <ul className="flex flex-col gap-2">
                {s.spend.map((c) => (
                  <li key={c.category} className="grid grid-cols-[5.5rem_minmax(0,1fr)_6rem] items-center gap-3 text-small">
                    <span className="truncate text-ink-2">{c.category}</span>
                    <Capsule value={c.total} max={top} color="var(--cat-wealth)" size="sm" label={c.category} />
                    <span className="text-end font-semibold text-ink tabular-nums">{formatMoney(c.total, currency)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {account ? <Note icon={Bookmark}>Column layout saved as {account}. Next time it maps itself.</Note> : null}
        </>
      ) : null}
    </div>
  )
}

/** The line above the result's numbers: what it did, with Undo beside it. */
export function ResultBar({ text, onUndo, busy }: { text: string; onUndo?: () => void; busy?: boolean }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-surface-2 px-3 py-2 text-small text-ink-2">
      <span className="min-w-0 flex-1 basis-60">{text}</span>
      {onUndo ? <button type="button" onClick={onUndo} disabled={busy} className="rounded-sm text-small font-medium text-ink underline decoration-ink/25 underline-offset-[3px] hover:decoration-ink focus-visible:outline-2 focus-visible:outline-pill disabled:opacity-50">Undo</button> : null}
    </p>
  )
}
