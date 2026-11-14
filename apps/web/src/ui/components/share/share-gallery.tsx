'use client'

import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { SHARE_FIELDS, SHARE_KINDS, defaultShow, type ShareKind, type ShareSize } from '@/domain/share-card'
import { ShareCardView, type ShareCardViewProps } from './share-card-view'

// /dev/ui: the share dialog in each state and every card kind × look × size. The pictures come from the real route with
// `fixture=1` (made-up data, only outside production or in mock mode), so this is the same Satori render a user gets.

const fixtureUrl = (kind: ShareKind, show: string[], theme: 'light' | 'dark', size: ShareSize) =>
  `/api/share/card?${new URLSearchParams({ kind, show: show.join(','), theme, size, fixture: '1' })}`

const noop = () => {}
const base = (kind: ShareKind, over: Partial<ShareCardViewProps>): ShareCardViewProps => ({
  kind, state: 'ready', src: fixtureUrl(kind, defaultShow(kind), 'light', 'square'), show: defaultShow(kind), size: 'square', theme: 'light',
  canShare: true, canCopy: true, secure: true, onToggle: noop, onSize: noop, onTheme: noop, onRetry: noop, onShare: noop, onDownload: noop, onCopy: noop, ...over,
})

const Panel = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div data-panel={`share-${title.split(/[ (:,]/)[0].toLowerCase()}-${title.length}`} className="min-w-0">
    <p className="mb-2 font-mono text-label text-ink-3 uppercase">{title}</p>
    <div className="w-[440px] max-w-full rounded-xl bg-surface p-5 shadow-3">
      <header className="mb-4 flex items-start gap-3">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-md bg-pill-wash text-pill-ink"><Share2 className="size-5" strokeWidth={1.5} /></span>
        <div className="min-w-0">
          <h2 className="text-heading text-ink">Share your week</h2>
          <p className="mt-0.5 text-small text-ink-3">Made on this machine. Only what you switch on is drawn.</p>
        </div>
      </header>
      {children}
    </div>
  </div>
)

export function ShareGallery() {
  const [show, setShow] = useState(defaultShow('weekly'))
  const [size, setSize] = useState<ShareSize>('square')
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const live = base('weekly', {
    show, size, theme, src: fixtureUrl('weekly', show, theme, size),
    onToggle: (id, on) => setShow((s) => (on ? [...s, id] : s.filter((x) => x !== id))), onSize: setSize, onTheme: setTheme,
  })
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start gap-6">
        <Panel title="Ready (live: tick, size and look draw a new card)"><ShareCardView {...live} /></Panel>
        <Panel title="Loading the preview"><ShareCardView {...base('weekly', { state: 'loading', src: null })} /></Panel>
        <Panel title="A field was toggled: the old card dims"><ShareCardView {...base('weekly', { refreshing: true, show: [...defaultShow('weekly'), 'steps'] })} /></Panel>
        <Panel title="Share not supported (plain http): Download only, with the hint"><ShareCardView {...base('level', { canShare: false, canCopy: false, secure: false })} /></Panel>
        <Panel title="The card could not be drawn"><ShareCardView {...base('weekly', { state: 'error', src: null, error: 'The card could not be drawn.' })} /></Panel>
        <Panel title="Not earned yet (404 from the server)"><ShareCardView {...base('achievement', { state: 'error', src: null, error: 'That achievement is not unlocked yet.' })} /></Panel>
        <Panel title="Story size, dark look"><ShareCardView {...base('streak', { size: 'story', theme: 'dark', src: fixtureUrl('streak', defaultShow('streak'), 'dark', 'story') })} /></Panel>
      </div>

      {SHARE_KINDS.map((kind) => (
        <div key={kind} data-panel={`share-cards-${kind}`}>
          <p className="mb-2 font-mono text-label text-ink-3 uppercase">{kind} card · defaults, then every field on</p>
          <div className="flex flex-wrap items-start gap-4">
            {(['light', 'dark'] as const).flatMap((t) => (['square', 'story'] as const).flatMap((s) => [defaultShow(kind), SHARE_FIELDS[kind].map((f) => f.id)].map((fields, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- the route's own PNG, drawn per request
              <img key={`${t}-${s}-${i}`} loading="lazy" src={fixtureUrl(kind, fields, t, s)} alt={`${kind} card, ${t}, ${s}, ${i ? 'all fields' : 'default fields'}`} className={s === 'story' ? 'h-[320px] w-auto rounded-md shadow-2' : 'size-[240px] rounded-md shadow-2'} />
            ))))}
          </div>
        </div>
      ))}
    </div>
  )
}
