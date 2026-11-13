'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '../button'

/** Lines to paste into .env or a terminal, in mono, with one Copy button. */
export function CopyLine({ lines, label }: { lines: string[]; label: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard?.writeText(lines.join('\n')).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="flex items-start gap-2 rounded-md bg-surface-2 py-2 pr-2 pl-3 shadow-inset">
      <pre aria-label={label} className="min-w-0 flex-1 py-1 font-mono text-caption leading-relaxed whitespace-pre-wrap break-all text-ink">{lines.join('\n')}</pre>
      <Button variant="ghost" size="sm" onClick={() => void copy()} aria-label={`Copy ${label}`}>
        {copied ? <Check className="size-4 text-good" strokeWidth={2} aria-hidden /> : <Copy className="size-4" strokeWidth={1.5} aria-hidden />}
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  )
}
