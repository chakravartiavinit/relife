import { AlarmClock, ArrowDownRight, ArrowUpRight, CalendarRange, Clock, Coins, ListOrdered, Moon, Repeat, ShoppingBasket, TriangleAlert } from 'lucide-react'
import type { Basket } from '@/core/basket'
import type { ItemCategory } from '@/domain/basket'
import { formatMoney } from '@/domain/money'
import { Card, CardHeader } from '../card'
import { StackedBars } from '../charts'
import { cn } from '../../cn'
import { BrandLogo } from '../brand-logo'

// What's inside your shopping-app orders: categories against your usual month, the items you spend on
// most, order habits that add up, and a plain-English list of where you're overspending.

// A 3D picture per item category (Fluent Emoji, MIT, public/categories), so lists read at a glance.
const ITEM_ART: Record<ItemCategory, string> = {
  'Fruits & vegetables': 'fruits', 'Dairy & eggs': 'dairy', 'Bakery & breakfast': 'bakery', 'Staples & cooking': 'staples',
  'Snacks & sweets': 'snacks', Water: 'water', Drinks: 'drinks', 'Meat & seafood': 'meat', 'Frozen & ready to eat': 'frozen',
  'Personal care': 'personal', 'Household & cleaning': 'household', 'Health & pharmacy': 'health', 'Baby & pets': 'baby',
  'Electronics & appliances': 'electronics', Books: 'books', 'Sports & fitness': 'fitness', 'Eating out': 'eating-out', 'Home & lifestyle': 'home', Other: 'other',
}

/** The category's picture on a tile tinted with its colour. */
function CategoryArt({ category, size = 'md' }: { category: ItemCategory; size?: 'sm' | 'md' }) {
  return (
    <span
      aria-hidden
      className={size === 'sm' ? 'grid size-7 shrink-0 place-items-center rounded-[8px] p-1' : 'grid size-9 shrink-0 place-items-center rounded-[10px] p-1.5'}
      style={{ background: `color-mix(in oklch, ${ITEM_COLOR[category]} 14%, var(--surface))` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- small local PNGs */}
      <img src={`/categories/${ITEM_ART[category]}.png`} alt="" width={64} height={64} className="size-full object-contain outline-none" />
    </span>
  )
}

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
const PLATFORM: Record<string, string> = { zepto: 'Zepto', blinkit: 'Blinkit', swiggy: 'Swiggy', zomato: 'Zomato', flipkart: 'Flipkart', amazon: 'Amazon' }
const monthShort = (m: string) => new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(new Date(`${m}-01T00:00:00Z`))

export function BasketSections({ b, month, base }: { b: Basket; month: string; base: string }) {
  if (!b.hasItems) return null
  const money = (v: number) => formatMoney(Math.round(v), base, { decimals: 0 })
  const over = b.categories.filter((c) => c.over)
  const h = b.habits
  const notes: { icon: typeof Moon; tone: 'bad' | 'warn' | 'neutral'; text: React.ReactNode }[] = [
    ...over.map((c) => ({
      icon: TriangleAlert, tone: 'bad' as const,
      text: <><b>{c.category}</b>: {money(c.now)} this month, {c.avg ? `${(c.now / c.avg).toFixed(1)}×` : 'well above'} your usual {money(c.avg)}.</>,
    })),
    ...(h.impulseShare >= 0.25 ? [{ icon: ShoppingBasket, tone: 'warn' as const, text: <><b>{Math.round(h.impulseShare * 100)}%</b> of your basket is snacks, drinks and ready-to-eat ({money(h.impulse)}).</> }] : []),
    ...(h.lateCount ? [{ icon: Moon, tone: 'warn' as const, text: <><b>{h.lateCount} late-night order{h.lateCount === 1 ? '' : 's'}</b> after 10 pm, {money(h.lateSpend)} in total.</> }] : []),
    ...(h.fees >= 100 ? [{ icon: Coins, tone: 'neutral' as const, text: <><b>{money(h.fees)}</b> went on delivery, handling and small-cart fees rather than items.</> }] : []),
    ...(h.smallCount >= 3 ? [{ icon: Coins, tone: 'neutral' as const, text: <><b>{h.smallCount} small top-ups</b> under ₹200 add up to {money(h.smallSpend)}. Batching them saves delivery and handling fees.</> }] : []),
  ]

  return (
    <>
      {/* Watch out: the plain-English summary, first because it's the point of the page. */}
      <Card>
        <CardHeader title="Where you’re overspending" description={`${monthShort(month)} compared with your previous 3 months · from your app orders`} icon={<TriangleAlert strokeWidth={2} />} color="var(--bad)" />
        {notes.length ? (
          <ul className="flex flex-col gap-2">
            {notes.map((n, i) => (
              <li key={i} className={cn('flex items-start gap-3 rounded-[14px] px-3.5 py-3 text-[13.5px] leading-relaxed text-ink-2 [&_b]:font-semibold [&_b]:text-ink',
                n.tone === 'bad' ? 'bg-bad/[0.07] dark:bg-bad/[0.14]' : n.tone === 'warn' ? 'bg-warn/[0.08] dark:bg-warn/[0.14]' : 'bg-ink/[0.03] dark:bg-white/[0.04]')}>
                <n.icon className={cn('mt-0.5 size-4 shrink-0', n.tone === 'bad' ? 'text-bad' : n.tone === 'warn' ? 'text-warn' : 'text-ink-3')} strokeWidth={2} aria-hidden />
                <span>{n.text}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-[13.5px] text-ink-3">Nothing stands out: every category is within its usual range.</p>}
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader title="Month by month" icon={<CalendarRange strokeWidth={2} />} color="var(--cat-wealth)" description="App orders by what you bought, last 6 months" />
          <StackedBars
            label="Spending by item category per month"
            unit="₹"
            categories={b.monthly.map((m) => monthShort(m.month))}
            series={[...b.top, 'Other' as const].map((c) => ({ id: c, name: c, color: ITEM_COLOR[c], values: b.monthly.map((m) => Math.round(m.row[c] ?? 0) || null) }))}
          />
        </Card>

        <Card>
          <CardHeader title="Order habits" icon={<Clock strokeWidth={2} />} color="var(--cat-wealth)" description={monthShort(month)} />
          <dl className="grid grid-cols-2 gap-2.5">
            <Habit icon={ShoppingBasket} label="Orders" value={String(h.orders)} sub={h.ordersAvg ? `usually ${Math.round(h.ordersAvg)}` : undefined} up={h.ordersAvg ? h.orders > h.ordersAvg * 1.2 : false} />
            <Habit icon={Coins} label="Average order" value={money(h.avgOrder)} />
            <Habit icon={Moon} label="After 10 pm" value={String(h.lateCount)} sub={h.lateCount ? money(h.lateSpend) : 'none'} up={h.lateCount >= 3} />
            <Habit icon={AlarmClock} label="Under ₹200" value={String(h.smallCount)} sub={h.smallCount ? money(h.smallSpend) : 'none'} up={h.smallCount >= 3} />
            <Habit icon={Coins} label="Fees paid" value={money(h.fees)} sub="delivery, handling" up={h.fees >= 300} />
            <Habit icon={ShoppingBasket} label="Snacks & drinks" value={`${Math.round(h.impulseShare * 100)}%`} sub="of your basket" up={h.impulseShare >= 0.3} />
          </dl>
          {b.platforms.length ? (
            <ul className="mt-4 flex flex-col gap-2 border-t border-divider pt-4">
              {b.platforms.map((p) => (
                <li key={p.platform} className="flex items-center gap-2.5 text-[13px]">
                  <BrandLogo name={p.platform} />
                  <span className="flex-1 text-ink-2">{PLATFORM[p.platform] ?? p.platform} <span className="text-ink-3 tabular-nums">· {p.orders} order{p.orders === 1 ? '' : 's'}</span></span>
                  <span className="font-medium text-ink tabular-nums">{money(p.total)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="By what you bought" icon={<ShoppingBasket strokeWidth={2} />} color="var(--cat-wealth)" description={`${monthShort(month)} vs your 3-month average`} />
          <ul className="flex flex-col gap-3">
            {b.categories.filter((c) => c.now > 0).map((c) => {
              const max = Math.max(...b.categories.map((x) => Math.max(x.now, x.avg)), 1)
              const up = c.delta != null && c.delta > 0.05, down = c.delta != null && c.delta < -0.05
              return (
                <li key={c.category} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 text-[13px] sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto]">
                  <span className="flex min-w-0 items-center gap-2.5 text-ink-2">
                    <CategoryArt category={c.category} size="sm" /><span className="truncate">{c.category}</span>
                  </span>
                  <span className="relative col-span-2 row-start-2 h-2.5 rounded-full bg-surface-2 sm:col-span-1 sm:row-start-auto" title={`Usual: ${money(c.avg)}`}>
                    <span className="reveal-fill absolute inset-y-0 start-0 rounded-full" style={{ '--fill': `${(c.now / max) * 100}%`, width: '100%', background: `color-mix(in oklch, ${ITEM_COLOR[c.category]} ${c.over ? 95 : 70}%, transparent)` } as React.CSSProperties} />
                    {c.avg ? <span aria-hidden className="absolute -inset-y-1 w-0.5 rounded-full bg-ink/60" style={{ insetInlineStart: `${(c.avg / max) * 100}%` }} /> : null}
                  </span>
                  <span className="flex items-center justify-end gap-2 tabular-nums">
                    <span className="font-medium text-ink">{money(c.now)}</span>
                    {c.delta != null ? (
                      <span className={cn('inline-flex h-5 min-w-12 items-center justify-end gap-0.5 rounded-full px-1.5 text-[11px] font-semibold', c.over ? 'bg-bad/12 text-bad' : up ? 'text-warn' : down ? 'text-good' : 'text-ink-3')}>
                        {up ? <ArrowUpRight className="size-3" strokeWidth={2.5} aria-hidden /> : down ? <ArrowDownRight className="size-3" strokeWidth={2.5} aria-hidden /> : null}
                        {Math.abs(Math.round(c.delta * 100))}%
                      </span>
                    ) : <span className="min-w-12 text-end text-[11px] text-ink-3">new</span>}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="mt-4 flex items-center gap-2 text-[12px] text-ink-3"><span aria-hidden className="h-3 w-0.5 rounded-full bg-ink/60" />Your usual month</p>
        </Card>

        <Card>
          <CardHeader title="Bought most often" description="Last 4 months · your regulars" icon={<Repeat strokeWidth={2} />} color="var(--pill)" />
          <ul className="flex flex-col divide-y divide-divider">
            {b.usual.map((it) => (
              <li key={it.name} className="flex items-center gap-3 py-2.5 text-[13px]">
                <CategoryArt category={it.category} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ink">{it.name}</span>
                  <span className="block truncate text-[12px] text-ink-3">{it.category}</span>
                </span>
                <span className="shrink-0 text-ink-3 tabular-nums">{it.times}×</span>
                <span className="w-20 shrink-0 text-end font-medium text-ink tabular-nums">{money(it.spend)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="px-0 pb-2">
        <CardHeader title="Top items" icon={<ListOrdered strokeWidth={2} />} color="var(--cat-wealth)" description={`${monthShort(month)} · ${b.items.length} different items · from ${b.itemsCoverage.withItems} of ${b.itemsCoverage.orders} app orders`} className="px-5" />
        <div role="table" aria-label="Top items" className="text-[13px]">
          <div role="row" className="hidden grid-cols-[minmax(0,1fr)_10rem_4rem_4rem_6rem] gap-4 border-b border-divider px-5 pb-2 text-[12px] font-medium text-ink-3 sm:grid">
            <span role="columnheader">Item</span><span role="columnheader">Category</span>
            <span role="columnheader" className="text-end">Orders</span><span role="columnheader" className="text-end">Qty</span><span role="columnheader" className="text-end">Spent</span>
          </div>
          {b.items.slice(0, 15).map((it) => (
            <div role="row" key={it.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 border-b border-divider px-5 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_10rem_4rem_4rem_6rem]">
              <span role="cell" className="flex min-w-0 items-center gap-3"><CategoryArt category={it.category} /><span className="truncate text-ink">{it.name}</span></span>
              <span role="cell" className="hidden truncate text-ink-3 sm:block">{it.category}</span>
              <span role="cell" className="hidden text-end text-ink-2 tabular-nums sm:block">{it.times}</span>
              <span role="cell" className="hidden text-end text-ink-2 tabular-nums sm:block">{it.qty}</span>
              <span role="cell" className="text-end font-medium text-ink tabular-nums">{money(it.spend)}</span>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}

function Habit({ icon: Icon, label, value, sub, up }: { icon: typeof Moon; label: string; value: string; sub?: string; up?: boolean }) {
  return (
    <div className={cn('rounded-[14px] p-3', up ? 'bg-warn/[0.09]' : 'bg-ink/[0.03] dark:bg-white/[0.04]')}>
      <dt className="flex items-center gap-1.5 text-[12px] text-ink-3"><Icon className={cn('size-3.5', up ? 'text-warn' : '')} strokeWidth={2} aria-hidden />{label}</dt>
      <dd className="mt-1 font-display text-[20px] leading-none font-bold text-ink tabular-nums">{value}</dd>
      {sub ? <dd className="mt-1 text-[11.5px] text-ink-3 tabular-nums">{sub}</dd> : null}
    </div>
  )
}
