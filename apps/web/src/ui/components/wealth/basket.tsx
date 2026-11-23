import type { Basket } from '@/core/basket'
import type { ItemCategory } from '@/domain/basket'
import { formatMoney } from '@/domain/money'
import { statusOf } from '@/domain/status-of'
import { Card, CardHeader } from '../card'
import { StackedBars } from '../charts'
import { Fold } from '../fold'
import { StatusRow } from '../status-row'

// What's inside your shopping-app orders, folded: where you are above usual, what you bought against your 3-month usual,
// the months, your regulars, the top items and the order habits in numbers. One card in the Spending rail; each part is a
// fold with one line of what is inside. Categories carry their 3D picture, a status word says which are above usual.

export const ITEM_COLOR: Record<ItemCategory, string> = {
  'Fruits & vegetables': 'var(--cat-relationships)',
  'Dairy & eggs': 'var(--cat-mind)',
  Water: 'var(--sky)',
  'Bakery & breakfast': 'var(--medal-gold)',
  'Staples & cooking': 'var(--cat-wealth)',
  'Snacks & sweets': 'var(--cat-health)',
  Drinks: 'var(--pill)',
  'Meat & seafood': 'var(--medal-bronze)',
  'Frozen & ready to eat': 'var(--medal-sakura)',
  'Personal care': 'var(--sakura)',
  'Household & cleaning': 'var(--medal-silver)',
  'Health & pharmacy': 'var(--good)',
  'Baby & pets': 'color-mix(in oklch, var(--cat-hobbies), var(--medal-gold))',
  'Electronics & appliances': 'var(--cat-hobbies)',
  Books: 'color-mix(in oklch, var(--cat-relationships), var(--cat-hobbies))',
  'Eating out': 'var(--bad)',
  'Sports & fitness': 'color-mix(in oklch, var(--cat-mind), var(--cat-health))',
  'Home & lifestyle': 'var(--cat-skills)',
  Other: 'var(--ink-3)',
}
const monthShort = (m: string) => new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(new Date(`${m}-01T00:00:00Z`))
const names = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : (xs[0] ?? ''))

export function BasketSections({ b, month, base }: { b: Basket; month: string; base: string }) {
  if (!b.hasItems) return null
  const money = (v: number) => formatMoney(Math.round(v), base, { decimals: 0 })
  const h = b.habits
  const bought = b.categories.filter((c) => c.now > 0)
  const over = b.categories.filter((c) => c.over)
  const up = bought.filter((c) => c.delta != null && c.delta > 0.05).sort((a, c) => (c.delta ?? 0) - (a.delta ?? 0))[0]

  // The plain-English list of where you are above usual: a category first, then a habit that adds up.
  const notes: { picture: { of: 'category' | 'routine'; name: string }; name: string; line: string; status?: ReturnType<typeof statusOf>['word'] }[] = [
    ...over.map((c) => ({
      picture: { of: 'category' as const, name: c.category }, name: `${c.category} is above usual`, status: statusOf({ from: 'month', vsUsual: c.delta }).word,
      line: `${money(c.now)} this month, ${c.avg ? `${(c.now / c.avg).toFixed(1)}× ` : 'well above '}your usual ${money(c.avg)}`,
    })),
    ...(h.impulseShare >= 0.25 ? [{ picture: { of: 'category' as const, name: 'Snacks & sweets' }, name: 'Snacks, drinks and ready-to-eat', line: `${Math.round(h.impulseShare * 100)}% of your basket, ${money(h.impulse)}` }] : []),
    ...(h.lateCount ? [{ picture: { of: 'routine' as const, name: 'sleep' }, name: 'Late-night orders', line: `${h.lateCount} after 10 pm, ${money(h.lateSpend)} in total` }] : []),
    ...(h.fees >= 100 ? [{ picture: { of: 'routine' as const, name: 'money' }, name: 'Fees, not items', line: `${money(h.fees)} on delivery, handling and small-cart fees` }] : []),
    ...(h.smallCount >= 3 ? [{ picture: { of: 'routine' as const, name: 'money' }, name: 'Small top-ups', line: `${h.smallCount} under ₹200 add up to ${money(h.smallSpend)}; batching saves fees` }] : []),
  ]
  const facts: [string, string, string?][] = [
    ['Orders', String(h.orders), h.ordersAvg ? `usually ${Math.round(h.ordersAvg)}` : undefined],
    ['Average order', money(h.avgOrder)],
    ['After 10 pm', String(h.lateCount), h.lateCount ? money(h.lateSpend) : undefined],
    ['Under ₹200', String(h.smallCount), h.smallCount ? money(h.smallSpend) : undefined],
    ['Fees paid', money(h.fees), 'delivery, handling'],
    ['Snacks and drinks', `${Math.round(h.impulseShare * 100)}%`, 'of your basket'],
  ]

  return (
    <Card aria-labelledby="basket-heading">
      <CardHeader
        title={<span id="basket-heading">From your app orders</span>}
        description={`${monthShort(month)} against your previous 3 months, from ${b.itemsCoverage.withItems} of ${b.itemsCoverage.orders} orders`}
      />
      <Fold title="Where you’re overspending" summary={notes.length ? `${notes.length} ${notes.length === 1 ? 'thing' : 'things'} above usual` : 'Nothing stands out'}>
        {notes.length
          ? <div>{notes.map((n) => <StatusRow key={n.name} picture={n.picture} name={n.name} line={n.line} status={n.status} />)}</div>
          : <p className="pb-2 ps-6 text-small text-ink-3">Every category is within its usual range.</p>}
      </Fold>
      <Fold title="By what you bought" summary={up ? `${up.category} is up most against your 3-month usual` : `${bought.length} categories, none above usual`}>
        <div>
          {bought.map((c) => (
            <StatusRow
              key={c.category} picture={{ of: 'category', name: c.category }} name={c.category}
              line={`${money(c.now)}${c.avg ? `, usually ${money(c.avg)}` : ', new this month'}`}
              status={c.delta == null ? undefined : statusOf({ from: 'month', vsUsual: c.delta }).word}
            />
          ))}
        </div>
      </Fold>
      <Fold title="Month by month" summary="App orders by what you bought, last 6 months">
        <StackedBars
          label="Spending by item category per month" unit="₹" height={220}
          categories={b.monthly.map((m) => monthShort(m.month))}
          series={[...b.top, 'Other' as const].map((c) => ({ id: c, name: c, color: ITEM_COLOR[c], values: b.monthly.map((m) => Math.round(m.row[c] ?? 0) || null) }))}
        />
      </Fold>
      <Fold title="Bought most often" summary={names(b.usual.slice(0, 3).map((it) => it.name))}>
        <div>
          {b.usual.map((it) => (
            <StatusRow key={it.name} picture={{ of: 'category', name: it.category }} name={it.name} line={`${it.times} times, ${it.category}`} value={money(it.spend)} />
          ))}
        </div>
      </Fold>
      <Fold title="Top items" summary={`${b.items.length} different items from ${b.itemsCoverage.withItems} of ${b.itemsCoverage.orders} orders`}>
        <div>
          {b.items.slice(0, 15).map((it) => (
            <StatusRow key={it.name} picture={{ of: 'category', name: it.category }} name={it.name} line={`${it.times} ${it.times === 1 ? 'order' : 'orders'}, quantity ${it.qty}`} value={money(it.spend)} />
          ))}
        </div>
      </Fold>
      <Fold title="Order habits in numbers" summary={`${h.orders} orders, ${money(h.avgOrder)} on average`}>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 pb-2 ps-6">
          {facts.map(([label, value, sub]) => (
            <div key={label} className="min-w-0">
              <dt className="text-small text-ink-3">{label}</dt>
              <dd className="text-body font-medium text-ink tabular-nums">{value}</dd>
              {sub ? <dd className="text-small text-ink-3 tabular-nums">{sub}</dd> : null}
            </div>
          ))}
        </dl>
        {b.platforms.length ? (
          <div className="ps-0">
            {b.platforms.map((p) => (
              <StatusRow key={p.platform} picture={{ of: 'merchant', name: p.platform }} name={p.platform.charAt(0).toUpperCase() + p.platform.slice(1)} line={`${p.orders} order${p.orders === 1 ? '' : 's'}`} value={money(p.total)} />
            ))}
          </div>
        ) : null}
      </Fold>
    </Card>
  )
}
