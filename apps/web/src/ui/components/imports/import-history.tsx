'use client'

import { useState, useTransition } from 'react'
import { LoaderCircle } from 'lucide-react'
import { undoImportAction } from '@/app/actions'
import { KIND_LABEL, summaryLine, type ImportKind, type ImportSummary } from '@/domain/imports'
import { useToast } from '../toast'
import { Button } from '../button'
import { KindChip, fmtDay } from './import-view'
import { cn } from '../../cn'

// Past imports, under the sources on Connections: what each file did, and Undo for a finished one. An import that is
// still queued or running says so. Undo asks once, inline: it removes every row the import added.

export type PastImport = {
  id: string; kind: ImportKind; fileName: string; status: 'queued' | 'running' | 'done' | 'failed' | 'undone'
  summary: ImportSummary; error: string | null; at: string
}

const STATUS = {
  queued: { label: 'Queued', tone: 'text-ink-2 bg-surface-2' },
  running: { label: 'Running', tone: 'text-pill-ink bg-pill-wash' },
  done: { label: 'Done', tone: 'text-good bg-good/10' },
  failed: { label: 'Failed', tone: 'text-bad bg-bad/10' },
  undone: { label: 'Removed', tone: 'text-ink-3 bg-surface-2' },
} as const

function Row({ i, onUndo }: { i: PastImport; onUndo: (id: string) => Promise<string | null> }) {
  const [ask, setAsk] = useState(false)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const st = STATUS[i.status]
  const line = i.status === 'done' ? summaryLine(i.kind, i.summary) : i.status === 'failed' ? i.error ?? 'The import failed' : i.status === 'undone' ? 'Everything it added was removed' : i.status === 'running' ? 'Running. It keeps going if you leave this page.' : 'Waiting for the worker'
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3">
      <KindChip kind={i.kind} />
      <div className="min-w-0 flex-1 basis-56">
        <p className="flex min-w-0 items-center gap-2">
          <span className="truncate text-body font-medium text-ink">{i.fileName}</span>
          <span className={cn('inline-flex h-5 shrink-0 items-center rounded-full px-2 text-label font-medium', st.tone)}>{st.label}</span>
        </p>
        <p className="truncate text-caption text-ink-3">{KIND_LABEL[i.kind]} · {fmtDay(i.at.slice(0, 10))} · {line}</p>
        {err ? <p role="alert" className="text-caption text-bad">{err}</p> : null}
      </div>
      {i.status === 'running' ? <LoaderCircle aria-label="Running" className="size-4 animate-spin text-ink-3 [animation-duration:0.9s]" /> : null}
      {i.status === 'done' && i.summary.added > 0 ? (
        ask ? (
          <span className="flex items-center gap-2">
            <span className="text-caption text-ink-2">Remove {i.summary.added.toLocaleString('en-US')} {i.kind === 'statement' ? 'rows' : 'days'}?</span>
            <Button variant="danger" size="sm" disabled={pending} onClick={() => start(async () => { setErr(await onUndo(i.id)); setAsk(false) })}>{pending ? 'Removing…' : 'Remove'}</Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => setAsk(false)}>Keep</Button>
          </span>
        ) : <Button variant="ghost" size="sm" onClick={() => setAsk(true)}>Undo</Button>
      ) : null}
    </li>
  )
}

export function PastImports({ imports }: { imports: PastImport[] }) {
  const toast = useToast()
  const [gone, setGone] = useState<string[]>([])
  if (!imports.length) return null
  const undo = async (id: string) => {
    const r = await undoImportAction(id).catch(() => ({ ok: false as const, error: 'Could not remove this import.' }))
    if (!r.ok) return r.error
    setGone((g) => [...g, id])
    toast('Import removed', 'neutral')
    return null
  }
  return (
    <section aria-labelledby="past-imports" className="flex flex-col gap-3">
      <div className="px-1">
        <h2 id="past-imports" className="text-heading text-ink">Past imports</h2>
        <p className="text-small text-ink-3">Files you imported. Undo removes everything a file added.</p>
      </div>
      <ul className="divide-y divide-divider rounded-lg bg-surface p-2 shadow-1">
        {imports.map((i) => <Row key={i.id} i={gone.includes(i.id) ? { ...i, status: 'undone' } : i} onUndo={undo} />)}
      </ul>
    </section>
  )
}
