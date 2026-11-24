'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { Button } from './button'
import { Loader, LoaderSwap } from './loader'

// The loader on the gallery: three sizes, a real progress value, reduced motion, light and dark, and Finish, which
// ends every wait at once so the hand-off can be watched. Finishing before a loader has appeared (300ms, page 400ms)
// shows nothing: press Replay and wait for the capsule first.
export function LoaderGallery() {
  const [done, setDone] = useState(false)
  const [run, setRun] = useState(0)
  const [reduced, setReduced] = useState(false)
  const [progress, setProgress] = useState(64)
  const motion = reduced ? 'reduce' : 'full'
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" size="sm" onClick={() => setDone(true)} disabled={done}>Finish</Button>
        <Button size="sm" onClick={() => { setDone(false); setRun((n) => n + 1) }}>Replay</Button>
        <label className="flex items-center gap-2 text-small text-ink-2">
          <input type="checkbox" checked={reduced} onChange={(e) => setReduced(e.target.checked)} className="size-4 accent-[var(--pill-ink)]" />
          Reduced motion
        </label>
        <label className="flex items-center gap-2 text-small text-ink-2">
          Progress {progress}%
          <input type="range" min={0} max={100} value={progress} onChange={(e) => setProgress(Number(e.target.value))} className="w-32 accent-[var(--pill-ink)]" aria-label="Progress" />
        </label>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {(['light', 'dark'] as const).map((theme) => (
          <section key={theme} data-theme={theme} aria-label={`${theme} theme`} className="flex flex-col gap-3 rounded-lg bg-bg p-4 text-ink shadow-1">
            <h3 className="text-small font-medium text-ink-2">{theme === 'light' ? 'Light' : 'Dark'}</h3>
            <LoaderSwap key={`${theme}-splash-${run}`} loading={!done} size="splash" label="Loading" motion={motion} className="min-h-52 w-full place-items-center rounded-md bg-surface shadow-1">
              <span className="text-body text-ink-2">Evening. 5 of 11 done. Next: Omega-3, due now.</span>
            </LoaderSwap>
            <div className="grid gap-3 sm:grid-cols-2">
              <LoaderSwap key={`${theme}-page-${run}`} loading={!done} size="page" label="Loading Health" motion={motion} className="min-h-40 w-full place-items-center rounded-md bg-surface shadow-1">
                <span className="text-heading font-medium text-ink">Sleep 7.4 h</span>
              </LoaderSwap>
              <div className="flex min-h-40 flex-col justify-center gap-3 rounded-md bg-surface p-4 shadow-1">
                <Button variant="secondary" size="sm" className="self-start" aria-label="Import file">
                  <LoaderSwap key={`${theme}-btn-${run}`} loading={!done} size="inline" px={16} label="Importing" motion={motion} className="size-4 place-items-center">
                    <Check className="size-4" strokeWidth={1.5} aria-hidden />
                  </LoaderSwap>
                  Import file
                </Button>
                <LoaderSwap key={`${theme}-row-${run}`} loading={!done} label="Reading bank.csv" showLabel motion={motion}>
                  <span className="text-small text-ink">1,930 rows added</span>
                </LoaderSwap>
                <Loader size="inline" label={`First sync ${progress}%`} showLabel progress={progress} delay={0} motion={motion} />
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
