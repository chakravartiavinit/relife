'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { addToGoal, quickLog, toggleCheck, undoQuickLog } from '@/app/actions'
import { amountText } from '@/domain/capture'
import type { QuickLogUndo } from '@/domain/quicklog'
import { routineArt } from '../../routine-icons'
import { Sheet, useIsDesktop } from '../sheet'
import { announceXp, useToast } from '../toast'
import { CAPTURE_EVENT, invalidateCapture, useCaptureData } from './capture-data'
import { CaptureView, type CaptureActions } from './capture-view'

/**
 * Capture (⌘K, the top-bar field, the tab-bar +, or the `relife:command` event): log, check off or ask from any
 * page. A centred palette on a laptop; on a phone the `Sheet` at its half detent with the input at the bottom,
 * lifted above the keyboard. Every result closes it and toasts with Undo; a failure keeps it open with what you typed.
 */
export function Capture() {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const desktop = useIsDesktop()
  const { data, status, retry } = useCaptureData(open)
  const close = useCallback(() => { setOpen(false); setValue('') }, [])
  const actions = useCaptureActions(close, retry)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    const onOpen = (e: Event) => {
      const text = (e as CustomEvent<{ text?: string } | undefined>).detail?.text
      if (text) setValue(text)
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener(CAPTURE_EVENT, onOpen)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener(CAPTURE_EVENT, onOpen) }
  }, [])

  useKeyboardInset(open && !desktop)

  const view = (layout: 'palette' | 'sheet') => (
    <CaptureView layout={layout} data={data} status={status} value={value} onValue={setValue} actions={actions} onClose={close} autoFocus={layout === 'palette'} />
  )

  if (!desktop) {
    return (
      <Sheet
        open={open} onOpenChange={(o) => (o ? setOpen(true) : close())} modal title="Capture" snapPoints={[0.5, 0.92]}
        className="mb-[var(--kb,0px)] max-h-[calc(100dvh-var(--kb,0px)-12px)]"
      >
        {view('sheet')}
      </Sheet>
    )
  }
  return open ? (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[84px]">
      {/* Opened by keyboard many times a day: no animation, it appears on the same frame. */}
      <div className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-[3px]" onClick={close} />
      <div role="dialog" aria-modal="true" aria-label="Capture" className="relative w-full max-w-[680px]">{view('palette')}</div>
    </div>
  ) : null
}

/** The on-screen keyboard's height as `--kb` on <html>, so a phone sheet sits above it instead of under it. */
function useKeyboardInset(on: boolean) {
  useEffect(() => {
    const vv = window.visualViewport
    if (!on || !vv) return
    const root = document.documentElement
    const sync = () => root.style.setProperty('--kb', `${Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))}px`)
    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => { vv.removeEventListener('resize', sync); vv.removeEventListener('scroll', sync); root.style.removeProperty('--kb') }
  }, [on])
}

/** Every Capture action: run it, toast what happened with Undo, close. A failure toasts and leaves Capture open. */
function useCaptureActions(close: () => void, retry: () => void): CaptureActions {
  const [busy, setBusy] = useState<string | null>(null)
  const busyRef = useRef(false)
  const router = useRouter()
  const toast = useToast()

  /** The Undo action of a toast. It fires once: a second tap does nothing (the server undo is also safe to repeat). */
  const undoable = (undo: () => Promise<Parameters<typeof announceXp>[1]>) => {
    let used = false
    return {
      label: 'Undo',
      onClick: () => {
        if (used) return
        used = true
        undo().then((news) => { invalidateCapture(); announceXp(toast, news); toast('Undone', 'neutral') }).catch(() => { used = false; toast.error('Couldn’t undo', 'Try again from Today') })
      },
    }
  }

  /** One action at a time. `fn` returns true when it worked (Capture closes) and throws or returns false when not. */
  const run = async (key: string, fn: () => Promise<boolean>) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(key)
    try {
      if (await fn()) { invalidateCapture(); close() }
    } catch {
      toast.error()
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }

  const log = (text: string, key: string) => run(key, async () => {
    const r = await quickLog(text)
    if (!r.ok) { toast.error('Couldn’t read that', r.message); return false }
    announceXp(toast, r.news)
    // “Water +250 ml · 750 ml today”: what was logged, then the running total.
    const [title, ...rest] = r.message.split(' · ')
    const token: QuickLogUndo | undefined = r.undo
    toast(title, 'good', { description: rest.join(' · ') || undefined, icon: routineArt(title, '', ''), action: token ? undoable(() => undoQuickLog(token)) : undefined })
    return true
  })

  return {
    busy,
    log,
    checkOff: (r) => run(`due:${r.scheduleId}|${r.occurrence}`, async () => {
      announceXp(toast, await toggleCheck(r.scheduleId, r.occurrence, 'done'))
      toast(`${r.name} done`, 'good', { description: r.xp ? `+${r.xp} XP` : undefined, icon: routineArt(r.name, r.kind, r.area), action: undoable(() => toggleCheck(r.scheduleId, r.occurrence, null)) })
      return true
    }),
    addStep: (g) => run(`goal:${g.scheduleId}`, async () => {
      const { undo, ...news } = await addToGoal(g.scheduleId, g.step)
      announceXp(toast, news)
      toast(`${g.name} +${amountText(g.step, g.unit)}`, 'good', {
        description: `${amountText(g.value + g.step, g.unit)} of ${amountText(g.target, g.unit)} today`, icon: routineArt(g.name, 'routine', g.area),
        action: undoable(() => undoQuickLog(undo)),
      })
      return true
    }),
    ask: (text) => { router.push(`/coach?ask=${encodeURIComponent(text)}`); close() },
    go: (href) => { router.push(href); close() },
    retry,
  }
}
