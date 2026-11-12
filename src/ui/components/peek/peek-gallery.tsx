'use client'

import type { PeekData } from '@/core/peek/types'
import { PEEK_FIXTURES } from '@/ui/fixtures/peek'
import { PeekView, peekHeading } from './peek-view'
import { Failed, Gone } from './peek-host'
import { PeekSkeleton } from './peek-parts'

// /dev/ui: every Peek type drawn from a fixture, plus the loading, 404 and error states, in a plain 440px frame
// (the real one is a fixed panel on a laptop and a bottom sheet on a phone).

function Frame({ title, children, heading }: { title: string; heading?: { title: string; description?: string; icon?: React.ReactNode }; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-small text-ink-2">{title}</div>
      <div className="w-full max-w-[440px] overflow-hidden rounded-lg bg-surface shadow-2">
        {heading ? (
          <div className="flex items-center gap-3 border-b border-line px-4 py-4">
            {heading.icon}
            <div className="min-w-0">
              <div className="truncate text-heading text-ink">{heading.title}</div>
              {heading.description ? <div className="truncate text-small text-ink-3">{heading.description}</div> : null}
            </div>
          </div>
        ) : null}
        <div className="px-4 py-6 lg:px-5 lg:py-5">{children}</div>
      </div>
    </div>
  )
}

const LABEL: Record<string, string> = {
  metric: 'Metric (Sleep)', routine: 'Routine (Water)', goal: 'Goal', txn: 'Payment', merchant: 'Merchant (3× the usual)', insight: 'Coach note',
  connector: 'Connection', person: 'Person (overdue)', quest: 'Quest', sync: 'Sync status (one failing)', brief: 'Summary',
}

const NO_BRIEF: PeekData = { type: 'brief', scope: 'wealth', line: null, facts: [], source: null, model: null }

export function PeekGallery() {
  return (
    <div className="grid items-start gap-8 xl:grid-cols-2 2xl:grid-cols-3">
      {Object.values(PEEK_FIXTURES).map((d) => (
        <Frame key={d.type} title={LABEL[d.type]} heading={peekHeading(d)}><PeekView data={d} /></Frame>
      ))}
      <Frame title="Summary (none written yet)" heading={peekHeading(NO_BRIEF)}><PeekView data={NO_BRIEF} /></Frame>
      <Frame title="Loading"><PeekSkeleton /></Frame>
      <Frame title="404: the item is gone"><Gone onClose={() => {}} /></Frame>
      <Frame title="Could not load"><Failed onRetry={() => {}} /></Frame>
    </div>
  )
}
