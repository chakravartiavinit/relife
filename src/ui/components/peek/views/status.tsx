'use client'

import Link from 'next/link'
import { CircleAlert, CircleCheck, CircleDashed, RefreshCw, Sparkles } from 'lucide-react'
import type { BriefPeek, SyncPeek } from '@/core/peek/types'
import { buttonClass } from '../../button'
import { Badge } from '../../card'
import { PeekFooter, PeekIcon, PeekNote, PeekOpen, PeekRow, PeekSection } from '../peek-parts'

const TONE = { good: 'var(--good)', warn: 'var(--warn)', bad: 'var(--bad)' } as const

export function syncHeading(d: SyncPeek) {
  return { title: 'Sync status', description: d.label, icon: <PeekIcon icon={d.tone === 'good' ? CircleCheck : d.tone === 'warn' ? CircleAlert : RefreshCw} color={TONE[d.tone]} /> }
}

/** Is data flowing? The worker's heartbeat and every connected source, failing ones first. */
export function SyncPeekView({ data: d }: { data: SyncPeek }) {
  const failing = d.connections.filter((c) => c.status === 'error').length
  return (
    <div>
      {!d.worker.alive ? (
        <PeekNote tone="bad" label="Worker offline">
          Nothing syncs while the worker is stopped. Numbers keep their last values; check-offs and Capture still save. Start it with <code className="font-mono">npm run dev</code>.
        </PeekNote>
      ) : failing ? (
        <PeekNote tone="warn" label="Needs a fix">{failing} {failing === 1 ? 'source is' : 'sources are'} failing. Open it to see why and fix it.</PeekNote>
      ) : (
        <PeekNote label="All good">The worker is running and every connected source is syncing.</PeekNote>
      )}

      <PeekSection label="Worker" className="mt-5">
        <PeekRow label="Heartbeat"><span className={d.worker.alive ? 'text-good' : 'text-bad'}>{d.worker.alive ? 'Running' : 'Stopped'}</span> · {d.worker.ago}</PeekRow>
      </PeekSection>

      <PeekSection label="Sources" aside={`${d.connections.length} connected`}>
        {d.connections.length ? (
          <ul className="divide-y divide-divider">
            {d.connections.map((c) => (
              <li key={c.id} className="py-2.5">
                <Link href={`/you/connections#${c.id}`} className="flex items-center gap-2.5 rounded-sm text-small focus-visible:outline-2 focus-visible:outline-pill">
                  {c.status === 'error' ? <CircleAlert className="size-4 shrink-0 text-bad" strokeWidth={1.5} aria-label="Failing" /> : c.status === 'ok' ? <CircleCheck className="size-4 shrink-0 text-good" strokeWidth={1.5} aria-label="Synced" /> : <CircleDashed className="size-4 shrink-0 text-ink-3" strokeWidth={1.5} aria-label="Waiting" />}
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{c.name}</span>
                  <span className="shrink-0 text-caption text-ink-3 tabular-nums">{c.status === 'waiting' ? 'first sync pending' : c.ago}</span>
                </Link>
                {c.error ? <p className="mt-1 pl-6.5 text-caption text-bad">{c.error}{c.failures > 1 ? ` (${c.failures} tries)` : ''}</p> : null}
              </li>
            ))}
          </ul>
        ) : <p className="text-small text-ink-3">Nothing is connected yet. Connect a source to start syncing.</p>}
      </PeekSection>
      <PeekFooter><PeekOpen href="/you/connections">Open Connections</PeekOpen></PeekFooter>
    </div>
  )
}

export function briefHeading(d: BriefPeek) {
  return { title: 'Why this summary', description: d.scope, icon: <PeekIcon icon={Sparkles} /> }
}

/** The numbers behind a one-line summary. Until the briefs job exists, it says so and offers Coach. */
export function BriefPeekView({ data: d }: { data: BriefPeek }) {
  if (!d.line) {
    return (
      <div>
        <PeekNote icon={Sparkles} label="No summary yet">
          ReLife has not written a summary for {d.scope} yet. When it does, this shows the sentence, the numbers it came from and whether rules or a model wrote it.
        </PeekNote>
        <div className="mt-5"><Link href={`/coach?ask=${encodeURIComponent(`How is my ${d.scope} going?`)}`} className={buttonClass({ variant: 'secondary' })}>Ask Coach instead</Link></div>
      </div>
    )
  }
  return (
    <div>
      <PeekNote icon={Sparkles} label="Summary">{d.line}</PeekNote>
      <PeekSection label="Built from">
        {d.facts.map((f) => <PeekRow key={f.label} label={f.label}>{f.value}</PeekRow>)}
      </PeekSection>
      <div className="mt-3 flex items-center gap-2 text-caption text-ink-3">Written by <Badge>{d.source === 'ai' ? (d.model ?? 'a model') : 'rules'}</Badge></div>
      <PeekFooter><PeekOpen href={`/coach?ask=${encodeURIComponent(`Why: ${d.line}`)}`}>Ask about this</PeekOpen></PeekFooter>
    </div>
  )
}
