'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Share2 } from 'lucide-react'
import brand from '@relife/brand/brand.json'
import { defaultShow, type ShareKind, type ShareSize } from '@/domain/share-card'
import { Sheet } from '../sheet'
import { useToast } from '../toast'
import { SHARE_EVENT, type ShareRequest } from './share-event'
import { ShareCardView, type ShareCardState } from './share-card-view'

// Share a card (level, streak, achievement or week). Mounted once in the app layout and opened with `openShareCard`.
// The PNG is drawn by GET /api/share/card on this server; the browser fetches it as a Blob, so Share, Download and Copy
// all use the picture on screen. Nothing is uploaded. Ticking a field draws a new card and dims the old one meanwhile.

const TITLE: Record<ShareKind, string> = { level: 'Share your level', streak: 'Share your streak', achievement: 'Share your achievement', weekly: 'Share your week' }

export function ShareCardDialog() {
  const [req, setReq] = useState<ShareRequest | null>(null)
  const [open, setOpen] = useState(false)
  const [round, setRound] = useState(0)
  useEffect(() => {
    const on = (e: Event) => { setReq((e as CustomEvent<ShareRequest>).detail); setRound((n) => n + 1); setOpen(true) }
    window.addEventListener(SHARE_EVENT, on)
    return () => window.removeEventListener(SHARE_EVENT, on)
  }, [])
  return (
    <Sheet open={open} onOpenChange={setOpen} modal title={req ? TITLE[req.kind] : 'Share'} description="Made on this machine. Only what you switch on is drawn." icon={<span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-md bg-pill-wash text-pill-ink"><Share2 className="size-5" strokeWidth={1.5} /></span>} snapPoints={[0.92]}>
      {open && req ? <ShareBody key={round} req={req} /> : null}
    </Sheet>
  )
}

/** The card URL for a choice. The server loads the numbers; this only says which card and which fields. */
export function cardUrl(kind: ShareKind, ref: string | undefined, show: string[], theme: 'light' | 'dark', size: ShareSize) {
  const q = new URLSearchParams({ kind, show: show.join(','), theme, size })
  if (ref) q.set('ref', ref)
  return `/api/share/card?${q}`
}

function ShareBody({ req }: { req: ShareRequest }) {
  const toast = useToast()
  const [show, setShow] = useState(() => defaultShow(req.kind))
  const [size, setSize] = useState<ShareSize>('square')
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'))
  const [src, setSrc] = useState<string | null>(null)
  const [state, setState] = useState<ShareCardState>('loading')
  const [error, setError] = useState<string>()
  const [refreshing, setRefreshing] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [caps, setCaps] = useState({ share: false, copy: false, secure: true })
  const blob = useRef<Blob | null>(null)
  const last = useRef<string | null>(null)

  useEffect(() => {
    const file = new File([''], 'card.png', { type: 'image/png' })
    setCaps({
      share: typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }),
      copy: typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write,
      secure: window.isSecureContext,
    })
    return () => { if (last.current) URL.revokeObjectURL(last.current) }
  }, [])

  const url = cardUrl(req.kind, req.ref, show, theme, size)
  useEffect(() => {
    const ac = new AbortController()
    setRefreshing(!!last.current)
    setState(last.current ? 'ready' : 'loading')
    // A short pause, so ticking several fields in a row draws one card.
    const t = setTimeout(async () => {
      try {
        const res = await fetch(url, { signal: ac.signal, cache: 'no-store' })
        if (!res.ok) {
          const j = await res.json().catch(() => null) as { error?: string | { message?: string } } | null
          throw new Error(typeof j?.error === 'string' ? (res.status === 404 ? j.error : 'The card could not be drawn.') : j?.error?.message ?? 'The card could not be drawn.')
        }
        const b = await res.blob()
        const next = URL.createObjectURL(b)
        if (last.current) URL.revokeObjectURL(last.current)
        last.current = next; blob.current = b
        setSrc(next); setState('ready'); setRefreshing(false)
      } catch (e) {
        if (ac.signal.aborted) return
        setError(e instanceof Error ? e.message : undefined); setState('error'); setRefreshing(false)
      }
    }, 120)
    return () => { clearTimeout(t); ac.abort() }
  }, [url, attempt])

  const filenameNow = () => `relife-${req.kind}-${new Date().toISOString().slice(0, 10)}.png`
  const download = () => {
    if (!blob.current) return
    const href = URL.createObjectURL(blob.current)
    const a = Object.assign(document.createElement('a'), { href, download: filenameNow() })
    a.click()
    setTimeout(() => URL.revokeObjectURL(href), 1000)
  }
  const share = async () => {
    if (!blob.current) return
    try { await navigator.share({ files: [new File([blob.current], filenameNow(), { type: 'image/png' })], title: brand.name }) } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) toast.error('Could not open the share sheet', 'Download the picture instead.')
    }
  }
  const copy = async () => {
    if (!blob.current) return
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob.current })]); toast('Image copied', 'good') } catch { toast.error('Could not copy the image', 'Download it instead.') }
  }
  const toggle = useCallback((id: string, on: boolean) => setShow((s) => (on ? [...s, id] : s.filter((x) => x !== id))), [])

  return (
    <ShareCardView
      kind={req.kind} state={state} src={src} error={error} show={show} size={size} theme={theme} refreshing={refreshing}
      canShare={caps.share} canCopy={caps.copy} secure={caps.secure}
      onToggle={toggle} onSize={setSize} onTheme={setTheme} onRetry={() => setAttempt((n) => n + 1)} onShare={share} onDownload={download} onCopy={copy}
    />
  )
}
