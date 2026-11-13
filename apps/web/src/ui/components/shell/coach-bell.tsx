import Link from 'next/link'
import { Bell } from 'lucide-react'
import { cn } from '../../cn'

/** The count pill: Coach's "needs you" total. Nothing at 0. Decorative; the link around it says the number. */
export function CountPill({ n, className }: { n: number; className?: string }) {
  if (!n) return null
  return <span aria-hidden className={cn('inline-grid h-5 min-w-5 place-items-center rounded-full bg-pill px-1.5 text-caption leading-4 font-bold text-white tabular-nums', className)}>{n > 99 ? '99+' : n}</span>
}

/** Coach's bell: opens Coach, with the same count as the sidebar and the tab bar. */
export function CoachBell({ count = 0 }: { count?: number }) {
  return (
    <Link
      href="/coach"
      aria-label={count ? `Coach, ${count} to review` : 'Coach'}
      className="relative grid size-10 place-items-center rounded-full text-ink-2 transition-[background-color,color,scale] duration-150 ease-out-quint hover:bg-surface-2 hover:text-ink active:scale-96 focus-visible:outline-2 focus-visible:outline-pill"
    >
      <Bell className="size-5" strokeWidth={1.5} aria-hidden />
      <CountPill n={count} className="absolute -top-px -right-1 h-[18px] min-w-[18px] px-1 text-label shadow-[0_0_0_2px_var(--bg)]" />
    </Link>
  )
}
