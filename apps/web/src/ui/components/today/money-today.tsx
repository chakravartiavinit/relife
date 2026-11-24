import type { MoneyView } from '@/core/today'
import { cn } from '@/ui/cn'
import { Fold } from '../fold'
import { StatCard } from '../stat-card'
import { StatusRow } from '../status-row'

const money = (name: string) => ({ of: 'merchant', name }) as const

/**
 * Money today as one stat card: what was spent against a usual day, with the latest payment's logo in the label. The
 * payments and what renews this week fold under it (each payment opens its Peek, an uncategorised one says so, one
 * typed into Capture is tagged).
 */
export function MoneyToday({ v, className }: { v: MoneyView; className?: string }) {
  const count = v.payments.length + v.more
  const last = v.payments[0]
  const soon = v.renewals.filter((r) => r.soon)
  const renews = soon.length ? `${soon[0].name} renews ${soon[0].when.toLowerCase()}` : v.renewals.length ? `${v.renewals.length} renew${v.renewals.length === 1 ? 's' : ''} this week` : 'nothing renews this week'
  const title = count ? `${count} payment${count === 1 ? '' : 's'}` : 'No payments yet'
  return (
    <StatCard
      label="Spent today" color="var(--cat-wealth)" picture={last ? money(last.logo) : undefined} status={v.status} figure={v.total}
      note={v.versus ? <span className={cn(v.versus.bad && 'font-medium text-bad-ink')}>{v.versus.text}</span> : undefined}
      className={className}
    >
      <div className="mt-2 border-t border-divider pt-1">
        <Fold title={title} summary={`${last ? `${last.name}${count > 1 ? ` and ${count - 1} more` : ''} · ` : ''}${renews}`}>
          {count ? (
            <ul className="pb-1">
              {v.payments.map((p) => (
                <li key={p.id}>
                  <StatusRow
                    picture={money(p.logo)} name={<>{p.name}{p.typed ? <span className="ms-2 rounded-full bg-surface-2 px-1.5 text-label font-normal text-ink-3">typed</span> : null}</>}
                    line={<>{p.sub}{p.needsCategory ? <>{p.sub ? ' · ' : ''}<span className="font-medium text-warn-ink">needs a category</span></> : null}</>}
                    peek={{ type: 'txn', id: p.id }} trailing={<span className="text-body font-medium text-ink tabular-nums">{p.amount}</span>}
                  />
                </li>
              ))}
              {v.more ? <li className="pt-1 text-caption text-ink-3">and {v.more} more</li> : null}
            </ul>
          ) : null}
          <h3 className="mt-2 mb-0.5 text-small font-medium text-ink-3">Renews this week</h3>
          {v.renewals.length ? (
            <ul>
              {v.renewals.map((r) => (
                <li key={r.id}>
                  <StatusRow
                    picture={money(r.name)} name={r.name} line={<span className={cn(r.soon && 'font-medium text-warn-ink')}>{r.when} · {r.weekday} {r.day}</span>}
                    peek={{ type: 'routine', id: r.id }} trailing={r.amount ? <span className="text-body font-medium text-ink tabular-nums">{r.amount}</span> : undefined}
                  />
                </li>
              ))}
            </ul>
          ) : <p className="pb-2 text-small text-ink-3">Nothing renews in the next 7 days.</p>}
        </Fold>
      </div>
    </StatCard>
  )
}
