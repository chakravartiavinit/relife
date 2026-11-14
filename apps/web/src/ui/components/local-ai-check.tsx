'use client'

import { useState, useTransition } from 'react'
import { LoaderCircle, RefreshCw } from 'lucide-react'
import { recheckLocalAi } from '@/app/actions'
import { Button } from './button'

/** The words shown when the free local AI does not answer, and the markup for a command inside them. */
export const LOCAL_AI_DOWN = 'Local AI not running'

/** Renders `like this` spans as code, so a command in a message reads as one. */
export function Cmd({ text }: { text: string }) {
  return text.split(/(`[^`]+`)/).map((p, k) => (p.startsWith('`')
    ? <code key={k} className="rounded-xs bg-surface-2 px-1 py-0.5 font-mono text-[0.92em] text-ink">{p.slice(1, -1)}</code>
    : p))
}

/**
 * "Check again": asks the local server now (skipping the 30 s memory) and refreshes the page. `onResult` lets a caller
 * (setup) react to the answer; the page refresh covers Coach and Connections.
 */
export function RecheckLocalAi({ onResult, variant = 'secondary', size = 'md', label = 'Check again' }: {
  onResult?: (r: Awaited<ReturnType<typeof recheckLocalAi>>) => void
  variant?: 'secondary' | 'primary'; size?: 'sm' | 'md'; label?: string
}) {
  const [pending, start] = useTransition()
  const [again, setAgain] = useState<string | null>(null)
  return (
    <>
      <Button variant={variant} size={size} disabled={pending} aria-busy={pending}
        onClick={() => start(async () => {
          const r = await recheckLocalAi().catch(() => ({ ok: false as const, error: 'Couldn’t check. Try again.' }))
          setAgain(r.ok ? (r.state === 'ok' ? null : 'Still not answering.') : r.error)
          onResult?.(r)
        })}>
        {pending ? <LoaderCircle aria-hidden className="size-3.5 animate-spin [animation-duration:0.7s]" /> : <RefreshCw aria-hidden className="size-3.5" strokeWidth={2} />}
        {label}
      </Button>
      <span role="status" className="sr-only">{again}</span>
    </>
  )
}
