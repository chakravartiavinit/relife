'use client'

import { useRef } from 'react'
import { cn } from '@/ui/cn'

// The connect code: 8 characters, no 0/O/1/I/L/U (plan §3). Paste fills every cell, typing moves on, Backspace moves back.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
const clean = (s: string) => [...s.toUpperCase()].filter((c) => ALPHABET.includes(c)).join('')

export function CodeInput({ value, onChange, onComplete, disabled, invalid, autoFocus, label = 'Connect code', className }: {
  value: string; onChange: (v: string) => void; onComplete?: (v: string) => void; disabled?: boolean; invalid?: boolean; autoFocus?: boolean; label?: string; className?: string
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const chars = value.padEnd(8, ' ').slice(0, 8).split('')
  const set = (next: string, focus: number) => {
    const v = next.slice(0, 8)
    onChange(v)
    refs.current[Math.min(focus, 7)]?.focus()
    if (v.length === 8) onComplete?.(v)
  }
  return (
    <div role="group" aria-label={label} className={cn('flex items-center gap-1', className)}>
      {chars.map((c, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el }}
          value={c.trim()}
          disabled={disabled}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={8}
          aria-label={`${label}, character ${i + 1} of 8`}
          aria-invalid={invalid || undefined}
          data-autofocus={autoFocus && i === 0 ? '' : undefined}
          onFocus={(e) => e.currentTarget.select()}
          onPaste={(e) => {
            e.preventDefault()
            const v = clean(e.clipboardData.getData('text'))
            if (v) set(v, v.length)
          }}
          onChange={(e) => {
            const typed = clean(e.target.value)
            if (!typed) { set(value.slice(0, i) + value.slice(i + 1), i); return }
            set(value.slice(0, i) + typed + value.slice(i + 1), i + typed.length)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !c.trim() && i > 0) { e.preventDefault(); set(value.slice(0, i - 1), i - 1) }
            if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
            if (e.key === 'ArrowRight' && i < 7) refs.current[i + 1]?.focus()
          }}
          className={cn(
            'h-11 w-0 min-w-0 max-w-10 flex-1 rounded-[10px] bg-surface-2 text-center font-mono text-[18px] font-bold text-ink uppercase shadow-inset caret-pill',
            'transition-[box-shadow,opacity] duration-150 ease-out-quint focus-visible:shadow-[0_0_0_2px_var(--pill)] focus-visible:outline-none disabled:opacity-50',
            invalid && 'shadow-[0_0_0_2px_var(--bad)]',
            i === 3 && 'mr-2',
          )}
        />
      ))}
    </div>
  )
}
