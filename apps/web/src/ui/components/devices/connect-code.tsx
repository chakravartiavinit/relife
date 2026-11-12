import { cn } from '@/ui/cn'

/** The 8-character connect code as two groups of four cells (`K7FQ-2M9X`). `struck` is the expired look. */
export function ConnectCode({ code, size = 'md', struck, className }: { code: string; size?: 'sm' | 'md' | 'lg'; struck?: boolean; className?: string }) {
  const chars = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase().padEnd(8, ' ').slice(0, 8).split('')
  return (
    <span role="text" aria-label={`Code ${chars.slice(0, 4).join(' ')}, ${chars.slice(4).join(' ')}`} className={cn('inline-flex items-center gap-1', className)}>
      {chars.map((c, i) => (
        <span
          key={i} aria-hidden
          className={cn(
            'grid place-items-center rounded-[10px] bg-surface-2 font-mono font-bold text-ink shadow-inset tabular-nums',
            size === 'lg' ? 'h-12 w-9 text-[24px]' : size === 'sm' ? 'h-9 w-[26px] text-[17px]' : 'h-10 w-[30px] text-[20px]',
            struck && 'text-ink-3 line-through decoration-ink-3',
            i === 3 && 'mr-2',
          )}
        >
          {c.trim()}
        </span>
      ))}
    </span>
  )
}
