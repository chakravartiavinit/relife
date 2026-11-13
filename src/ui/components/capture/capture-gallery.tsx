'use client'

import { useState } from 'react'
import type { CapturePayload } from '@/domain/capture'
import { CaptureView, type CaptureActions } from './capture-view'

// /dev/ui: Capture's states drawn from fixtures, in a plain frame (the real one is a fixed overlay).

const FIXTURE: CapturePayload = {
  now: '2026-11-12T08:40:00.000Z', bucket: 'afternoon', currency: 'INR',
  due: [
    { scheduleId: 'a', occurrence: '2026-11-12T08:30:00.000Z', name: 'Lunch walk · 10 min', time: '14:00', area: 'health', kind: 'routine', status: 'pending', xp: 10 },
    { scheduleId: 'b', occurrence: '2026-11-12T03:00:00.000Z', name: 'Meditate · 10 min', time: '08:30', area: 'mind', kind: 'routine', status: 'missed', xp: 10 },
  ],
  goals: [
    { scheduleId: 'w', slug: 'water', name: 'Water', value: 1250, target: 3000, unit: 'ml', step: 250, area: 'health' },
    { scheduleId: 'r', slug: 'read', name: 'Read', value: 12, target: 20, unit: 'pages', step: 5, area: 'skills' },
  ],
  frequent: [{ slug: 'guitar', name: 'Guitar', unit: 'min', area: 'hobbies', typical: 20 }],
  trackers: [{ slug: 'water', name: 'Water', unit: 'ml' }, { slug: 'mood', name: 'Mood', unit: null }, { slug: 'guitar', name: 'Guitar', unit: 'min' }],
  moodToday: null,
  spend: [{ note: 'Chai', amount: 120, currency: 'INR' }, { note: 'Auto', amount: 80, currency: 'INR' }, { note: 'Lunch', amount: 250, currency: 'INR' }],
}

const idle: CaptureActions = { busy: null, checkOff: () => {}, addStep: () => {}, log: () => {}, ask: () => {}, go: () => {}, retry: () => {} }

function Frame({ title, layout = 'palette', data = FIXTURE, status = 'ready', value = '', busy = null }: {
  title: string; layout?: 'palette' | 'sheet'; data?: CapturePayload | null; status?: 'loading' | 'ready' | 'error'; value?: string; busy?: string | null
}) {
  const [v, setV] = useState(value)
  const sheet = layout === 'sheet'
  return (
    <div>
      <div className="mb-2 text-small text-ink-2">{title}</div>
      <div className={sheet ? 'flex h-[520px] w-[390px] max-w-full flex-col overflow-hidden rounded-t-xl bg-surface px-4 pt-4 shadow-3' : 'w-full max-w-[680px]'}>
        <div className={sheet ? 'min-h-0 flex-1 overflow-y-auto' : ''}>
          <CaptureView layout={layout} data={data} status={status} value={v} onValue={setV} actions={{ ...idle, busy }} onClose={() => {}} autoFocus={false} />
        </div>
      </div>
    </div>
  )
}

/** Capture's states for /dev/ui: suggestions, typed log preview, Ask fallback, saving, loading and error. */
export function CaptureGallery() {
  return (
    <div className="grid gap-8 xl:grid-cols-2">
      <Frame title="Empty input: due now, quick log, mood, spent" />
      <Frame title="Typed quick log: preview, open, ask" value="water 250" />
      <Frame title="Typed, not a log: check off matches, pages, ask" value="walk" />
      <Frame title="Saving (one action at a time)" busy="goal:w" />
      <Frame title="Loading suggestions" data={null} status="loading" />
      <Frame title="Could not load (typing still works)" data={null} status="error" />
      <Frame title="Phone sheet, half detent" layout="sheet" />
      <Frame title="Phone sheet, typed" layout="sheet" value="mood 4" />
    </div>
  )
}
