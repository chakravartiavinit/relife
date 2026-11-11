import { cn } from '../../cn'

/** A key hint: ⌘K, esc, N. Mono 11, 16px tall. */
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={cn('inline-flex h-4 min-w-4 items-center justify-center rounded-xs border border-line-2 bg-fill-soft px-1 font-mono text-[11px] leading-4 text-ink-3', className)}>
      {children}
    </kbd>
  )
}
