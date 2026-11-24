import { cn } from '../../cn'

/** The count pill: Coach's "needs you" total. Nothing at 0. Decorative; the link around it says the number. */
export function CountPill({ n, className }: { n: number; className?: string }) {
  if (!n) return null
  return <span aria-hidden className={cn('inline-grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1.5 text-caption leading-4 font-medium text-bg tabular-nums', className)}>{n > 99 ? '99+' : n}</span>
}
