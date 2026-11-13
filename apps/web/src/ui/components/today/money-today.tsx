import Link from 'next/link'
import { Wallet } from 'lucide-react'
import type { MoneyView } from '@/core/today'
import { cn } from '@/ui/cn'
import { BrandLogo } from '../brand-logo'
import { Card, CardHeader } from '../card'
import { PeekLink } from '../peek/peek-link'

const ROW = 'flex min-h-12 items-center gap-3 rounded-md p-2 -mx-2 transition-colors duration-150 ease-out-quint hover:bg-ink/[0.04] focus-visible:outline-2 focus-visible:outline-pill dark:hover:bg-white/[0.05]'

/**
 * Money today: the total against a usual day, the last payments (each opens its Peek, an uncategorised one says
 * so, one typed into Capture is tagged) and what renews this week.
 */
export function MoneyToday({ v }: { v: MoneyView }) {
  return (
    <Card>
      <CardHeader title="Money today" icon={<Wallet strokeWidth={1.5} />} color="var(--cat-wealth)"
        action={<Link href="/wealth" className="inline-flex h-10 items-center rounded-md px-2 text-small font-medium text-pill-ink hover:underline">Wealth</Link>} />
      <p className="-mt-1 mb-3 flex flex-wrap items-baseline gap-x-2">
        <span className="num text-display">{v.total}</span>
        {v.versus ? <span className={cn('text-small tabular-nums', v.versus.bad ? 'font-medium text-bad' : 'text-good')}>{v.versus.text}</span> : null}
      </p>
      {v.payments.length ? (
        <ul className="flex flex-col">
          {v.payments.map((p) => (
            <li key={p.id}>
              <PeekLink to={{ type: 'txn', id: p.id }} className={ROW}>
                <BrandLogo name={p.logo} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-body text-ink">
                    <span className="truncate">{p.name}</span>
                    {p.typed ? <span className="shrink-0 rounded-full bg-surface-2 px-1.5 text-label text-ink-3">typed</span> : null}
                  </span>
                  <span className="block truncate text-caption text-ink-3 tabular-nums">
                    {p.sub}{p.needsCategory ? <>{p.sub ? ' · ' : ''}<span className="font-medium text-warn">needs a category</span></> : null}
                  </span>
                </span>
                <span className="shrink-0 text-body font-medium text-ink tabular-nums">{p.amount}</span>
              </PeekLink>
            </li>
          ))}
          {v.more ? <li className="pt-1 text-caption text-ink-3">and {v.more} more</li> : null}
        </ul>
      ) : <p className="text-small text-ink-3">No payments yet today.</p>}

      <div className="mt-4 border-t border-divider pt-4">
        <h3 className="mb-1 font-mono text-label text-ink-3 uppercase">Renews this week</h3>
        {v.renewals.length ? (
          <ul className="flex flex-col">
            {v.renewals.map((r) => (
              <li key={r.id}>
                <PeekLink to={{ type: 'routine', id: r.id }} className={ROW}>
                  <span aria-hidden className={cn('grid size-10 shrink-0 place-content-center rounded-md bg-surface-2 text-center leading-none', r.soon && 'bg-warn/14 text-warn')}>
                    <span className="font-mono text-label uppercase opacity-70">{r.weekday}</span>
                    <span className="num mt-0.5 text-small">{r.day}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body text-ink">{r.name}</span>
                    <span className={cn('block text-caption', r.soon ? 'font-medium text-warn' : 'text-ink-3')}>{r.when}</span>
                  </span>
                  {r.amount ? <span className="shrink-0 text-body font-medium text-ink tabular-nums">{r.amount}</span> : null}
                </PeekLink>
              </li>
            ))}
          </ul>
        ) : <p className="text-small text-ink-3">Nothing renews in the next 7 days.</p>}
      </div>
    </Card>
  )
}
