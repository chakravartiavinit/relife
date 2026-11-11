import Link from 'next/link'
import { cn } from '../../cn'

const TONE = {
  bad: 'bg-bad-bg text-bad shadow-[inset_0_0_0_1px_var(--red-line)]',
  warn: 'bg-warn-bg text-warn shadow-[inset_0_0_0_1px_var(--amber-line)]',
  info: 'bg-accent-bg text-accent-text shadow-[inset_0_0_0_1px_var(--accent-line)]',
}

/** A 28px pill in a hero: "2 Overdue", "Claude Pro renews tomorrow". A link when `href` is set. */
export function Pill({ href, count, tone = 'bad', logo, children, className }: {
  href?: string; count?: number | string; tone?: keyof typeof TONE; logo?: React.ReactNode; children: React.ReactNode; className?: string
}) {
  const cls = cn(
    'relative inline-flex h-7 items-center gap-2 rounded-full bg-fill-soft pr-2.5 text-[12px] leading-4 font-medium whitespace-nowrap text-ink shadow-inset transition-[background-color] duration-150',
    // Hit area to 40px without changing layout.
    "after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']",
    count !== undefined || logo ? 'pl-[5px]' : 'pl-2.5',
    href && 'hover:bg-hover',
    className,
  )
  const body = (
    <>
      {count !== undefined ? <span className={cn('inline-flex size-[18px] items-center justify-center rounded-full font-mono text-[11px] leading-none tabular-nums', TONE[tone])}>{count}</span> : null}
      {logo}
      {children}
    </>
  )
  return href ? <Link href={href} className={cls}>{body}</Link> : <span className={cls}>{body}</span>
}
