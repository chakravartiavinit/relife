import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'

/** The quiet link at the right of a card head ("Trends ↗", "Spending ↗"): a destination, not an action. */
export function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-8 items-center gap-1 rounded-sm text-small font-medium text-ink-2 transition-colors duration-150 hover-fine:text-ink focus-visible:outline-2 focus-visible:outline-pill">
      {children}<ArrowUpRight aria-hidden className="size-3.5" strokeWidth={1.5} />
    </Link>
  )
}
