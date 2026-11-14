'use client'

import brand from '@relife/brand/brand.json'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, FileUp, LoaderCircle, Upload } from 'lucide-react'
import {
  cancelImportAction, createImportAction, finishUploadAction, importStatusAction, previewImportAction, startImportAction, undoImportAction,
} from '@/app/actions'
import {
  CSV_MAX_MB, KIND_LABEL, isCsvKind, sniffKind, summaryLine,
  type ImportKind, type ImportMapping, type ImportPreview, type ImportProgress as Progress, type ImportSummary,
} from '@/domain/imports'
import { Button, buttonClass } from '../button'
import { Dialog, FormError } from '../forms/dialog'
import { useToast } from '../toast'
import { cn } from '../../cn'
import {
  ACCEPT, FileRow, ImportProgress, ImportRail, ImportResult, KindPicker, Note, PRIVACY, ResultBar, SavedChip, StatementColumns, StatementTable,
  TrackerColumns, TrackerTable, ZipFound, fmtDay, fmtSize,
} from './import-view'
import { uploadFile } from './upload'

// Import a file (You › Connections): pick a kind and a file, check the columns, then watch it run and undo it if it is
// not right. The file goes up in 8 MiB chunks (upload.ts), is read on the server and stays on this machine. Closing the
// window while it uploads cancels it; once it runs, it keeps running and shows under Past imports.

type Stage = 'pick' | 'sending' | 'columns' | 'starting' | 'running' | 'done'
type Ok = Exclude<ImportPreview, { ok: false }>
type Status = { status: string; progress: Progress; summary: ImportSummary; error: string | null }

const ZIP_RAIL = ['Pick a file', 'Check file', 'Done'] as const

export function ImportDialog({ open, onClose, zipMaxMb = 2048 }: { open: boolean; onClose: () => void; zipMaxMb?: number }) {
  const router = useRouter()
  const toast = useToast()
  const [kind, setKind] = useState<ImportKind>('statement')
  const [file, setFile] = useState<File | null>(null)
  const [stage, setStage] = useState<Stage>('pick')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(0)
  const [importId, setImportId] = useState<string | null>(null)
  const [preview, setPreview] = useState<Ok | null>(null)
  const [mapping, setMapping] = useState<ImportMapping | null>(null)
  const [status, setStatus] = useState<Status | null>(null)
  const [undone, setUndone] = useState(false)
  const [busy, setBusy] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const seq = useRef(0)
  const input = useRef<HTMLInputElement>(null)

  const reset = useCallback(() => {
    abort.current?.abort()
    setKind('statement'); setFile(null); setStage('pick'); setError(null); setSent(0); setImportId(null)
    setPreview(null); setMapping(null); setStatus(null); setUndone(false); setBusy(false)
  }, [])
  // Closed: forget this run, so the next opening starts at the first step.
  useEffect(() => { if (!open) { const t = setTimeout(reset, 250); return () => clearTimeout(t) } }, [open, reset])

  const dropUpload = (id: string | null) => { if (id) void cancelImportAction(id).catch(() => {}) }
  const close = () => {
    // Before it runs, the half-made import is removed; after, it runs on.
    if (stage === 'sending') { abort.current?.abort(); dropUpload(importId) }
    else if (stage === 'columns' || stage === 'starting') dropUpload(importId)
    onClose()
  }

  const choose = (f: File | null) => {
    if (!f) return
    setFile(f); setError(null)
    const k = sniffKind(f.name)
    if (k && (isCsvKind(k) === isCsvKind(kind))) return // a CSV for a CSV kind: keep the kind they picked
    if (k) setKind(k)
  }

  const send = async () => {
    if (!file) return
    setError(null); setStage('sending'); setSent(0)
    const made = await createImportAction({ kind, fileName: file.name, size: file.size }).catch(() => ({ ok: false as const, error: `Could not reach ${brand.name}. Try again.` }))
    if (!made.ok) { setError(made.error); setStage('pick'); return }
    setImportId(made.id)
    const ctl = (abort.current = new AbortController())
    const up = await uploadFile(file, made.id, made.chunkBytes, setSent, ctl.signal)
    if (!up.ok) {
      if (up.aborted) return
      dropUpload(made.id); setImportId(null); setError(up.error); setStage('pick'); return
    }
    const p = await finishUploadAction(made.id).catch(() => ({ ok: false as const, error: 'This file could not be read. Try again.' }))
    if (!p.ok) { dropUpload(made.id); setImportId(null); setError(p.error); setStage('pick'); return }
    setPreview(p)
    setMapping('mapping' in p ? p.mapping : null)
    setStage('columns')
  }

  // A column choice changes what the preview shows: ask again (the latest answer wins).
  const edit = (m: ImportMapping) => {
    setMapping(m)
    if (!importId) return
    const mine = ++seq.current
    setTimeout(async () => {
      if (mine !== seq.current) return
      const p = await previewImportAction(importId, m).catch(() => null)
      if (mine === seq.current && p?.ok) setPreview(p)
    }, 250)
  }

  const start = async () => {
    if (!importId) return
    setError(null); setStage('starting')
    const r = await startImportAction(importId, mapping ?? undefined).catch(() => ({ ok: false as const, error: 'Could not start the import. Try again.' }))
    if (!r.ok) { setError(r.error); setStage('columns'); return }
    setStatus(null); setStage('running')
  }

  // Running: ask how far it is until it is done or failed.
  useEffect(() => {
    if (stage !== 'running' || !importId) return
    let live = true
    const tick = async () => {
      const s = await importStatusAction(importId).catch(() => null)
      if (!live || !s) return
      setStatus(s as Status)
      if (s.status === 'done') { setStage('done'); router.refresh() }
      else if (s.status === 'failed' || s.status === 'cancelled') { setError(s.error ?? 'The import failed.'); setStage('columns') }
    }
    void tick()
    const t = setInterval(tick, 1500)
    return () => { live = false; clearInterval(t) }
  }, [stage, importId, router])

  const undo = async () => {
    if (!importId) return
    setBusy(true)
    const r = await undoImportAction(importId).catch(() => ({ ok: false as const, error: 'Could not remove this import.' }))
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setUndone(true)
    toast('Import removed', 'neutral')
  }

  const statement = preview?.kind === 'statement' ? preview : null
  const tracker = preview?.kind === 'tracker-csv' ? preview : null
  const zip = preview && (preview.kind === 'apple-health' || preview.kind === 'takeout') ? preview : null
  const step = stage === 'pick' || stage === 'sending' ? 0 : stage === 'done' ? 2 : 1
  const ready = statement ? statement.ready : tracker ? tracker.ready : !!zip
  const toAdd = statement ? statement.rows : tracker ? tracker.rows : 0
  const summary = status?.summary
  const currency = mapping?.kind === 'statement' ? mapping.currency : 'INR'
  const where = kind === 'statement' ? { href: '/wealth/spending', label: 'Open Spending' } : { href: kind === 'tracker-csv' ? '/' : '/health', label: kind === 'tracker-csv' ? 'Open Today' : 'Open Health' }
  const limit = isCsvKind(kind) ? `CSV up to ${CSV_MAX_MB} MB` : `ZIP up to ${zipMaxMb >= 1024 ? `${+(zipMaxMb / 1024).toFixed(1)} GB` : `${zipMaxMb} MB`}`

  return (
    <Dialog open={open} onClose={close} icon={FileUp} width="max-w-[640px]" title="Import a file"
      description={<span className="inline-flex items-center gap-1.5">{PRIVACY}</span>}>
      <div className="flex flex-col gap-5">
        <ImportRail current={step as 0 | 1 | 2} labels={isCsvKind(kind) ? undefined : ZIP_RAIL} />

        {stage === 'pick' || stage === 'sending' ? (
          <>
            <KindPicker kind={kind} onPick={(k) => { setKind(k); if (file && sniffKind(file.name) && isCsvKind(sniffKind(file.name)!) !== isCsvKind(k)) setFile(null) }} disabled={stage === 'sending'} />
            <div>
              <h3 className="mb-2 text-small font-semibold text-ink">File</h3>
              {file ? (
                <FileRow name={file.name} size={file.size} busy={stage === 'sending'}
                  detail={stage === 'sending' ? `Sending ${fmtSize(sent)} of ${fmtSize(file.size)}` : undefined}
                  action={stage === 'pick' ? <Button variant="ghost" size="sm" onClick={() => input.current?.click()}>Change file</Button> : undefined} />
              ) : (
                <label onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); choose(e.dataTransfer.files[0] ?? null) }}
                  className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-[16px] border border-dashed border-hairline bg-surface-2/50 p-4 text-center transition-[background-color] duration-150 hover:bg-surface-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-pill">
                  <Upload aria-hidden className="size-5 text-ink-3" strokeWidth={1.5} />
                  <span className="text-small font-medium text-ink">Choose a file or drop it here</span>
                  <span className="text-caption text-ink-3">{KIND_LABEL[kind]}</span>
                </label>
              )}
              <input ref={input} data-autofocus type="file" accept={ACCEPT(kind)} className="sr-only" aria-label="Choose a file" tabIndex={file ? -1 : 0}
                onChange={(e) => { choose(e.target.files?.[0] ?? null); e.target.value = '' }} />
              {stage === 'sending' && file ? (
                <div className="mt-3"><ImportProgress phase="Sending" done={sent} total={file.size} /></div>
              ) : null}
            </div>
            <FormError message={error ?? undefined} />
            {kind === 'statement' ? <Note>Bank rows that match an app order (same amount, within 2 days) are linked, not counted twice.</Note> : null}
          </>
        ) : null}

        {(stage === 'columns' || stage === 'starting') && preview ? (
          <>
            <FileRow name={file?.name ?? ''} size={file?.size ?? 0}
              detail={[statement || tracker ? `${toAdd.toLocaleString('en-US')} ${statement ? 'rows' : 'values'}` : '', statement?.from && statement.to ? `${fmtDay(statement.from)} to ${fmtDay(statement.to)}` : '',
                (statement ?? tracker)?.savedFrom ? `same columns as ${(statement ?? tracker)!.savedFrom}` : ''].filter(Boolean).join(' · ')}
              action={(statement ?? tracker)?.savedFrom ? <SavedChip /> : undefined} />
            {statement && mapping?.kind === 'statement' ? (
              <>
                <section aria-label="Columns"><h3 className="mb-2 text-small font-semibold text-ink">Columns</h3><StatementColumns preview={{ ...statement, mapping }} onChange={edit} /></section>
                <StatementTable preview={{ ...statement, mapping }} />
              </>
            ) : null}
            {tracker && mapping?.kind === 'tracker-csv' ? (
              <>
                <section aria-label="Columns"><h3 className="mb-2 text-small font-semibold text-ink">Columns</h3><TrackerColumns preview={{ ...tracker, mapping }} onChange={edit} /></section>
                <TrackerTable preview={tracker} />
              </>
            ) : null}
            {zip ? <ZipFound preview={zip} /> : null}
            <FormError message={error ?? undefined} />
          </>
        ) : null}

        {stage === 'running' ? (
          <ImportProgress phase={status?.progress.phase ?? 'Starting'} done={status?.progress.done ?? 0} total={status?.progress.total} />
        ) : null}

        {stage === 'done' && summary ? (
          <>
            <ResultBar text={undone ? 'Removed. Everything this import added is gone; orders still count.' : summaryLine(kind, summary)} onUndo={undone ? undefined : undo} busy={busy} />
            <ImportResult kind={kind} fileName={file?.name ?? ''} summary={summary} currency={currency}
              account={mapping?.kind === 'statement' ? mapping.account.name : undefined} undone={undone} />
            <FormError message={error ?? undefined} />
          </>
        ) : null}

        {/* The action bar: a quiet line on the left, the actions on the right. */}
        <div className="-mx-6 -mb-6 mt-1 flex flex-wrap items-center justify-between gap-3 border-t border-divider px-6 py-4">
          <p className="min-w-0 flex-1 basis-48 text-caption text-pretty text-ink-3 tabular-nums">
            {stage === 'pick' ? limit
              : stage === 'sending' ? 'Sending. Closing this window cancels it.'
              : stage === 'columns' || stage === 'starting' ? (statement ? `${statement.rows.toLocaleString('en-US')} to add${statement.linkable ? ` · ${statement.linkable} match app orders and will be linked` : ''}` : tracker ? `${tracker.rows.toLocaleString('en-US')} values to add` : 'Nothing is changed until you start')
              : stage === 'running' ? 'You can close this window. It keeps running.'
              : undone ? 'Removed' : 'Undo removes every row from this import'}
          </p>
          <div className="flex items-center gap-2">
            {stage === 'pick' ? (
              <>
                <Button variant="ghost" onClick={close}>Cancel</Button>
                <Button variant="primary" onClick={() => void send()} disabled={!file} aria-disabled={!file}>Continue</Button>
              </>
            ) : stage === 'sending' ? (
              <Button variant="ghost" onClick={close}>Cancel</Button>
            ) : stage === 'columns' || stage === 'starting' ? (
              <>
                <Button variant="secondary" disabled={stage === 'starting'} onClick={() => { dropUpload(importId); setImportId(null); setPreview(null); setMapping(null); setError(null); setStage('pick') }}>Back</Button>
                <Button variant="primary" onClick={() => void start()} disabled={!ready || stage === 'starting'} aria-busy={stage === 'starting'}>
                  {stage === 'starting' ? <LoaderCircle aria-hidden className="size-4 animate-spin [animation-duration:0.7s]" /> : null}
                  {statement ? `Import ${statement.rows.toLocaleString('en-US')} rows` : tracker ? `Import ${tracker.rows.toLocaleString('en-US')} values` : 'Start import'}
                </Button>
              </>
            ) : stage === 'running' ? (
              <Button variant="secondary" onClick={close}>Close</Button>
            ) : (
              <>
                <Button variant="ghost" onClick={reset}>Import another</Button>
                <Link href={where.href} onClick={onClose} className={cn(buttonClass({ variant: 'primary' }))}>{where.label}<ArrowRight className="size-3.5 rtl:-scale-x-100" strokeWidth={2} /></Link>
              </>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  )
}
