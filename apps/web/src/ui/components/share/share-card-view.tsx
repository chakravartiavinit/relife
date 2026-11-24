'use client'

import Link from 'next/link'
import { Copy, Download, ImageOff, Share2 } from 'lucide-react'
import { SHARE_FIELDS, type ShareKind, type ShareSize } from '@/domain/share-card'
import { Checkbox } from '@/ui/beui/motion/checkbox'
import { cn } from '../../cn'
import { Button } from '../button'
import { Segmented } from '../form'
import { Loader } from '../loader'
import { SHARE_TARGETS, TargetMark, type ShareTarget } from './share-targets'

// The share dialog's body, presentational: the dialog owns the fetching, `/dev/ui` draws every state from fixtures.

export type ShareCardState = 'loading' | 'ready' | 'error'
export type ShareCardViewProps = {
  kind: ShareKind
  state: ShareCardState
  /** The rendered PNG (an object URL in the app, a fixture route in /dev/ui). Kept while the next one loads. */
  src: string | null
  error?: string
  show: string[]
  size: ShareSize
  theme: 'light' | 'dark'
  /** Whether a new picture is on its way over an old one (the old one dims). */
  refreshing?: boolean
  canShare: boolean
  canCopy: boolean
  /** False on plain http://<LAN IP>: the Web Share API needs HTTPS, so the hint points at the phone guide. */
  secure: boolean
  onToggle: (id: string, on: boolean) => void
  onSize: (s: ShareSize) => void
  onTheme: (t: 'light' | 'dark') => void
  onRetry: () => void
  onShare: () => void
  onDownload: () => void
  onCopy: () => void
  /** Post to a site: the dialog copies (or saves) the picture, then opens the site's new-post page with the words. */
  onPost: (t: ShareTarget) => void
}

const DIMENSIONS = { square: '1080 × 1080', story: '1080 × 1920' } as const

export function ShareCardView(p: ShareCardViewProps) {
  const ready = p.state === 'ready'
  const busy = p.state === 'loading' || p.refreshing
  return (
    // Wide: the card on the left, the choices on the right. Narrow: one column, the card first.
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-4">
        {/* The picture sits in a well the size of the card, so nothing jumps while it loads. */}
        <div className="grid place-items-center rounded-lg bg-surface-2 p-3">
          <div className={cn('relative overflow-hidden rounded-md bg-surface shadow-2', p.size === 'story' ? 'aspect-[9/16] h-[min(560px,70dvh)]' : 'aspect-square w-full')}>
            {p.src ? (
              // eslint-disable-next-line @next/next/no-img-element -- an object URL made from the server's PNG, not a static asset
              <img src={p.src} alt="Preview of the share card" className={cn('size-full object-contain transition-opacity duration-150 ease-out-quint', busy && 'opacity-40')} />
            ) : null}
            {p.state === 'loading' && !p.src ? <span className="absolute inset-0 animate-pulse bg-surface-3/60" aria-hidden /> : null}
            {busy ? (
              <span className="absolute inset-0 grid place-items-center"><Loader size="inline" label="Drawing the card" /></span>
            ) : null}
            {p.state === 'error' ? (
              <div role="alert" className="absolute inset-0 grid place-content-center justify-items-center gap-3 p-5 text-center">
                <ImageOff className="size-6 text-ink-3" strokeWidth={1.5} aria-hidden />
                <p className="text-small text-ink-2 text-pretty">{p.error ?? 'The card could not be drawn.'}</p>
                <Button size="sm" onClick={p.onRetry}>Try again</Button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-small font-semibold text-ink">Size</span>
            <Segmented name="share-size" aria-label="Card size" value={p.size} onValueChange={(v) => p.onSize(v as ShareSize)} options={[{ value: 'square', label: 'Square' }, { value: 'story', label: 'Story' }]} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-small font-semibold text-ink">Look</span>
            <Segmented name="share-theme" aria-label="Card look" value={p.theme} onValueChange={(v) => p.onTheme(v as 'light' | 'dark')} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
          </div>
          <span className="ms-auto pb-2 text-caption text-ink-3 tabular-nums">PNG · {DIMENSIONS[p.size]}</span>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 flex w-full items-baseline justify-between text-small font-semibold text-ink">
            Show on the card
            <span className="text-caption font-normal text-ink-3 tabular-nums">{p.show.length} of {SHARE_FIELDS[p.kind].length}</span>
          </legend>
          <ul className="flex flex-col divide-y divide-divider">
            {SHARE_FIELDS[p.kind].map((f) => (
              <li key={f.id} className="flex min-h-11 items-center py-1.5">
                <Checkbox checked={p.show.includes(f.id)} onCheckedChange={(on) => p.onToggle(f.id, on)} label={f.label} description={f.hint} className="w-full" />
              </li>
            ))}
          </ul>
          <p className="text-caption text-ink-3 text-pretty">Money amounts, notes, goal reasons, merchants and people are never on a card.</p>
        </fieldset>

        <section aria-labelledby="share-to" className="flex flex-col gap-2 border-t border-divider pt-4">
          <h3 id="share-to" className="text-small font-semibold text-ink">Post to</h3>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-2">
            {SHARE_TARGETS.map((t) => (
              <li key={t.id}>
                <Button size="md" disabled={!ready} onClick={() => p.onPost(t)} className="w-full justify-start px-2.5" aria-label={`Post to ${t.name}`}>
                  <TargetMark path={t.path} className="size-4 shrink-0" />
                  <span className="truncate">{t.name}</span>
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-caption text-ink-3 text-pretty">
            {p.canCopy ? 'The picture is copied first. Paste it into the post that opens.' : 'The picture is saved first. Attach it to the post that opens.'}
          </p>
        </section>

        <div className="flex flex-col gap-2 border-t border-divider pt-4">
          <div className="flex flex-wrap items-center gap-2">
            {p.canCopy ? <Button size="md" disabled={!ready} onClick={p.onCopy}><Copy className="size-4" strokeWidth={1.5} aria-hidden />Copy image</Button> : null}
            {p.canShare ? <Button size="md" disabled={!ready} onClick={p.onShare}><Share2 className="size-4" strokeWidth={1.5} aria-hidden />More…</Button> : null}
            <Button variant="primary" size="md" disabled={!ready} onClick={p.onDownload} className="ms-auto"><Download className="size-4" strokeWidth={1.5} aria-hidden />Download PNG</Button>
          </div>
          {!p.secure ? (
            <p className="text-caption text-ink-3 text-pretty">
              The share sheet needs a secure address (HTTPS). Download works here; to share straight from your phone, see <Link href="/you/settings/devices/phone" className="font-medium text-pill-ink underline-offset-2 hover:underline">Use on your phone</Link>.
            </p>
          ) : null}
          <p className="text-caption text-ink-3 text-pretty">Drawn on this machine. Nothing is uploaded until you post it.</p>
        </div>
      </div>
    </div>
  )
}
