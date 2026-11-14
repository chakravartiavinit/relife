import brand from '@relife/brand/brand.json'
import { connection } from 'next/server'
import { cn } from '../cn'
import { isDemo } from '@/core/demo'

// The read-only demo's banner (RELIFE_DEMO=1, src/core/demo.ts). It looks like the mock badge, with the warn tokens. The
// layout is built ahead of time, so these two read the flag per request (after `connection()`), never at build.

export const DEMO_LINK = 'https://github.com/chakravartiavinit/relife#readme'

/** The thin strip above the page: "Demo · sample data · changes are off" and a link to get the app. */
export function DemoStrip({ className }: { className?: string }) {
  return (
    <div
      role="status"
      className={cn('flex min-h-8 flex-wrap items-center justify-center gap-x-2 gap-y-0.5 px-4 py-1.5 text-center text-caption font-semibold text-warn', className)}
      style={{ background: 'color-mix(in oklch, var(--warn) 14%, transparent)', boxShadow: 'inset 0 -1px 0 color-mix(in oklch, var(--warn) 35%, transparent)' }}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-warn" />
      <span>Demo · sample data · changes are off</span>
      <a href={DEMO_LINK} className="rounded-xs underline underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-pill">Get {brand.name} →</a>
    </div>
  )
}

/** The sidebar badge slot, where mock mode shows "Mock mode · random data". */
export function DemoBadge() {
  return (
    <span
      title="A read-only demo with sample data. Nothing you do is saved."
      className="-mt-1 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md px-2.5 text-[12px] font-semibold whitespace-nowrap text-warn shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--warn)_35%,transparent)]"
      style={{ background: 'color-mix(in oklch, var(--warn) 14%, transparent)' }}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-warn" />
      Demo · sample data
    </span>
  )
}

/** The strip, only in the demo. Put it in a `<Suspense fallback={null}>`. */
export async function DemoBanner({ className }: { className?: string }) {
  await connection()
  return isDemo() ? <div className={className}><DemoStrip /></div> : null
}

/** The sidebar badge, only in the demo. Put it in a `<Suspense fallback={null}>`. */
export async function DemoSidebarBadge() {
  await connection()
  return isDemo() ? <DemoBadge /> : null
}
