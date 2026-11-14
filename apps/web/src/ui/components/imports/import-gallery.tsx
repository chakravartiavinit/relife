'use client'

import { useState } from 'react'
import { FileUp } from 'lucide-react'
import type { ImportKind } from '@/domain/imports'
import { summaryLine } from '@/domain/imports'
import {
  FAIL_MESSAGE, HEALTH_PREVIEW, HEALTH_SUMMARY, NOTHING_NEW, PAST_IMPORTS, STATEMENT_NEW, STATEMENT_PREVIEW, STATEMENT_SUMMARY, TRACKER_PREVIEW,
} from '../../fixtures/import'
import { Button } from '../button'
import { FormError } from '../forms/dialog'
import { PastImports } from './import-history'
import {
  FileRow, ImportProgress, ImportRail, ImportResult, KindPicker, Note, PRIVACY, ResultBar, SavedChip, StatementColumns, StatementTable,
  TrackerColumns, TrackerTable, ZipFound,
} from './import-view'

// /dev/ui: every state of the import dialog and of Past imports, drawn from fixtures. No upload or action runs.

const Panel = ({ title, children, footer }: { title: string; children: React.ReactNode; footer?: React.ReactNode }) => (
  <div className="min-w-0">
    <p className="mb-2 font-mono text-label text-ink-3 uppercase">{title}</p>
    <div className="w-[640px] max-w-full rounded-xl bg-surface shadow-3">
      <header className="flex items-start gap-3 px-6 pt-5 pb-3">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-pill-wash text-pill-ink"><FileUp className="size-5" strokeWidth={2} /></span>
        <div className="min-w-0">
          <h2 className="font-display text-heading text-ink">Import a file</h2>
          <p className="mt-1 text-small text-ink-3">{PRIVACY}</p>
        </div>
      </header>
      <div className="flex flex-col gap-5 px-6 pb-6">
        {children}
        {footer ? <div className="-mx-6 -mb-6 mt-1 flex flex-wrap items-center justify-between gap-3 border-t border-divider px-6 py-4">{footer}</div> : null}
      </div>
    </div>
  </div>
)
const Foot = ({ note, children }: { note: string; children: React.ReactNode }) => (
  <>
    <p className="min-w-0 flex-1 basis-48 text-caption text-pretty text-ink-3 tabular-nums">{note}</p>
    <div className="flex items-center gap-2">{children}</div>
  </>
)

export function ImportGallery() {
  const [kind, setKind] = useState<ImportKind>('statement')
  const [mapping, setMapping] = useState(STATEMENT_PREVIEW.mapping)
  const [fresh, setFresh] = useState(STATEMENT_NEW.mapping)
  return (
    <div className="flex flex-wrap items-start gap-6">
      <Panel title="1 · Pick a file: nothing chosen" footer={<Foot note="CSV up to 25 MB"><Button variant="ghost">Cancel</Button><Button variant="primary" disabled aria-disabled>Continue</Button></Foot>}>
        <ImportRail current={0} />
        <KindPicker kind={kind} onPick={setKind} />
        <div>
          <h3 className="mb-2 text-small font-semibold text-ink">File</h3>
          <div className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-[16px] border border-dashed border-hairline bg-surface-2/50 p-4 text-center">
            <span className="text-small font-medium text-ink">Choose a file or drop it here</span>
            <span className="text-caption text-ink-3">Bank or card statement</span>
          </div>
        </div>
      </Panel>

      <Panel title="1 · Pick a file: chosen, with the match note" footer={<Foot note="CSV up to 25 MB"><Button variant="ghost">Cancel</Button><Button variant="primary">Continue</Button></Foot>}>
        <ImportRail current={0} />
        <KindPicker kind="statement" onPick={() => {}} />
        <div>
          <h3 className="mb-2 text-small font-semibold text-ink">File</h3>
          <FileRow name="sample-statement-oct-2026.csv" size={65_536} detail="418 rows" action={<Button variant="ghost" size="sm">Change file</Button>} />
        </div>
        <Note>Bank rows that match an app order (same amount, within 2 days) are linked, not counted twice.</Note>
      </Panel>

      <Panel title="1 · Pick a file: sending a large zip" footer={<Foot note="Sending. Closing this window cancels it."><Button variant="ghost">Cancel</Button></Foot>}>
        <ImportRail current={0} labels={['Pick a file', 'Check file', 'Done']} />
        <FileRow name="export.zip" size={1_932_735_283} busy detail="Sending 612 MB of 1843 MB" />
        <ImportProgress phase="Sending" done={612} total={1843} />
      </Panel>

      <Panel title="1 · Pick a file: the file could not be read" footer={<Foot note="CSV up to 25 MB"><Button variant="ghost">Cancel</Button><Button variant="primary">Continue</Button></Foot>}>
        <ImportRail current={0} />
        <FileRow name="notes.csv" size={2048} action={<Button variant="ghost" size="sm">Change file</Button>} />
        <FormError message={FAIL_MESSAGE} />
      </Panel>

      <Panel title="2 · Check columns: a saved mapping, linked rows"
        footer={<Foot note="412 to add · 37 match app orders and will be linked"><Button variant="secondary">Back</Button><Button variant="primary">Import 412 rows</Button></Foot>}>
        <ImportRail current={1} />
        <FileRow name="sample-statement-oct-2026.csv" size={65_536} detail="418 rows · 1 Oct 2026 to 31 Oct 2026 · same columns as last Sample Bank file" action={<SavedChip />} />
        <section aria-label="Columns"><h3 className="mb-2 text-small font-semibold text-ink">Columns</h3><StatementColumns idBase="g1" preview={{ ...STATEMENT_PREVIEW, mapping }} onChange={setMapping} /></section>
        <StatementTable preview={{ ...STATEMENT_PREVIEW, mapping }} />
      </Panel>

      <Panel title="2 · Check columns: a new bank, dates could be read two ways"
        footer={<Foot note="Pick the amount column to see rows"><Button variant="secondary">Back</Button><Button variant="primary" disabled aria-disabled>Import 0 rows</Button></Foot>}>
        <ImportRail current={1} />
        <FileRow name="card-statement.csv" size={20_480} detail="new columns" />
        <section aria-label="Columns"><h3 className="mb-2 text-small font-semibold text-ink">Columns</h3><StatementColumns idBase="g2" preview={{ ...STATEMENT_NEW, mapping: fresh }} onChange={setFresh} /></section>
        <StatementTable preview={{ ...STATEMENT_NEW, mapping: fresh }} />
      </Panel>

      <Panel title="2 · Check columns: tracker CSV" footer={<Foot note="96 values to add"><Button variant="secondary">Back</Button><Button variant="primary">Import 96 values</Button></Foot>}>
        <ImportRail current={1} />
        <FileRow name="habits.csv" size={4096} detail="96 values · 1 Aug 2026 to 31 Oct 2026" />
        <section aria-label="Columns"><h3 className="mb-2 text-small font-semibold text-ink">Columns</h3><TrackerColumns idBase="g3" preview={TRACKER_PREVIEW} onChange={() => {}} /></section>
        <TrackerTable preview={TRACKER_PREVIEW} />
      </Panel>

      <Panel title="2 · Check file: Apple Health" footer={<Foot note="Nothing is changed until you start"><Button variant="secondary">Back</Button><Button variant="primary">Start import</Button></Foot>}>
        <ImportRail current={1} labels={['Pick a file', 'Check file', 'Done']} />
        <FileRow name="export.zip" size={1_932_735_283} />
        <ZipFound preview={HEALTH_PREVIEW} />
      </Panel>

      <Panel title="Running: with a count" footer={<Foot note="You can close this window. It keeps running."><Button variant="secondary">Close</Button></Foot>}>
        <ImportRail current={1} />
        <ImportProgress phase="Reading" done={1_240_000} total={2_900_000} />
      </Panel>

      <Panel title="Running: no count yet" footer={<Foot note="You can close this window. It keeps running."><Button variant="secondary">Close</Button></Foot>}>
        <ImportRail current={1} />
        <ImportProgress phase="Saving" done={0} />
      </Panel>

      <Panel title="3 · Done: a statement" footer={<Foot note="Undo removes every row from this import"><Button variant="ghost">Import another</Button><Button variant="primary">Open Spending</Button></Foot>}>
        <ImportRail current={2} />
        <ResultBar text={summaryLine('statement', STATEMENT_SUMMARY)} onUndo={() => {}} />
        <ImportResult kind="statement" fileName="sample-statement-oct-2026.csv" summary={STATEMENT_SUMMARY} currency="INR" account="Sample Bank" />
      </Panel>

      <Panel title="3 · Done: Apple Health" footer={<Foot note="Undo removes every row from this import"><Button variant="ghost">Import another</Button><Button variant="primary">Open Health</Button></Foot>}>
        <ImportRail current={2} labels={['Pick a file', 'Check file', 'Done']} />
        <ResultBar text={summaryLine('apple-health', HEALTH_SUMMARY)} onUndo={() => {}} />
        <ImportResult kind="apple-health" fileName="export.zip" summary={HEALTH_SUMMARY} currency="INR" />
      </Panel>

      <Panel title="3 · Done: nothing new" footer={<Foot note="Undo removes every row from this import"><Button variant="ghost">Import another</Button><Button variant="primary">Open Spending</Button></Foot>}>
        <ImportRail current={2} />
        <ImportResult kind="statement" fileName="sample-statement-oct-2026.csv" summary={NOTHING_NEW} currency="INR" />
      </Panel>

      <Panel title="3 · Done: removed with Undo" footer={<Foot note="Removed"><Button variant="ghost">Import another</Button><Button variant="primary">Open Spending</Button></Foot>}>
        <ImportRail current={2} />
        <ResultBar text="Removed. Everything this import added is gone; orders still count." />
        <ImportResult kind="statement" fileName="sample-statement-oct-2026.csv" summary={STATEMENT_SUMMARY} currency="INR" undone />
      </Panel>

      <div className="w-full max-w-[760px]"><p className="mb-2 font-mono text-label text-ink-3 uppercase">Past imports: running, done, failed, removed</p><PastImports imports={PAST_IMPORTS} /></div>
    </div>
  )
}
