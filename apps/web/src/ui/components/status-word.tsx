import { cn } from '../cn'
import { STATUS_TONE, type Status, type StatusTone } from '@/domain/status-of'

// A status as a coloured word with a dot, never a chip, and never colour alone: the word says it. Quiet has a hollow
// dot. The inks are the text-safe `--good-ink`, `--warn-ink`, `--bad-ink` (4.5:1 on surface and surface-2).

const INK: Record<StatusTone, string> = {
  good: 'text-good-ink', warn: 'text-warn-ink', bad: 'text-bad-ink', neutral: 'text-ink-2', quiet: 'text-ink-3',
}

/** `status` is one of the six words (`statusOf()` gives it); `tone` overrides the ink for a custom word. */
export function StatusWord({ status, tone, children, className }: { status?: Status; tone?: StatusTone; children?: React.ReactNode; className?: string }) {
  const t = tone ?? (status ? STATUS_TONE[status] : 'neutral')
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-label whitespace-nowrap', INK[t], className)}>
      <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', t === 'quiet' ? 'shadow-[inset_0_0_0_1.5px_currentColor]' : 'bg-current')} />
      {children ?? status}
    </span>
  )
}
