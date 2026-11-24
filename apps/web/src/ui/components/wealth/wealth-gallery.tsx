import { Suspense } from 'react'
import { connection } from 'next/server'
import { SPEND_CATEGORIES } from '@/core/categorize'
import type { Change, Signal } from '@/domain/patterns'
import type { CategoryPace } from '@/domain/category-pace'
import { formatMoney } from '@/domain/money'
import { Card, CardHeader, Skeleton } from '../card'
import { CategoryList } from './category-list'
import { DayBars, type Day } from './day-bars'
import { WealthOverviewView, type WealthOverview } from './overview'
import { Transactions, type TxnRow } from './transactions'
import { HabitBlock } from './weekly-quest'

// /dev/ui: the Wealth Overview and the Spending pieces from fixed data (one fixed "today"): the pace chart with the usual
// month dashed, the category status rows and the fold, the day bars with the rent day cut, the habit connection with the
// weekly quest, and the transaction list with its filters.

const TODAY = '2026-11-23'
const MONTHS = ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11']
const CATS = ['Rent', 'Shopping', 'Eating out', 'Groceries', 'Food delivery', 'Subscriptions']
const money = (v: number, opts?: { sign?: boolean }) => formatMoney(v, 'INR', { decimals: 0, ...opts })

// The spending days so far: rent on the 3rd, a steady few hundred a day around it.
const DAILY = Array.from({ length: 23 }, (_, i) => (i === 2 ? 28720 : Math.round(900 + ((i * 7919) % 17) * 150)))
const CAT_PACE: CategoryPace[] = [
  { category: 'Rent', now: 28000, usual: 28000, vsUsual: 0 },
  { category: 'Eating out', now: 11860, usual: 7400, vsUsual: 0.6 },
  { category: 'Food delivery', now: 4205, usual: 2895, vsUsual: 0.45 },
  { category: 'Shopping', now: 7420, usual: 8900, vsUsual: -0.17 },
  { category: 'Groceries', now: 3003, usual: 3050, vsUsual: -0.02 },
  { category: 'Subscriptions', now: 2551, usual: 2551, vsUsual: 0 },
  { category: 'Entertainment', now: 899, usual: 1100, vsUsual: -0.18 },
  { category: 'Transport', now: 640, usual: null, vsUsual: null },
]

const signal = (id: string, name: string, area: string, direction: Signal['direction']): Signal => ({ id, name, area, group: id, direction, days: new Map() })
const CHANGE: Change = { signal: signal('spend:apps', 'Delivery app spending', 'wealth', 'down'), recent: 1100, usual: 820, pct: 0.34, with: [{ signal: signal('orders:late', 'Late-night orders', 'wealth', 'down'), pct: 0.5 }] }
const QUEST = { key: 'w-frugal', title: 'Spend less than usual on 3 days', progress: 1, target: 3, done: false }

const OVERVIEW = {
  base: 'INR', today: TODAY, month: '2026-11', months: MONTHS, activeMonths: 4, categories: CATS,
  byMonthCat: new Map(MONTHS.map((m, i) => [m, new Map(CATS.map((c, j) => [c, i === 0 ? 0 : Math.round(28000 / (j + 1) * (0.8 + i * 0.07))]))])),
  byMonth: new Map([['2026-10', 60000], ['2026-09', 58000], ['2026-08', 62000], ['2026-07', 61000]]), year: 321369,
  pace: { spent: DAILY.reduce((a, b) => a + b, 0), day: 23, daysInMonth: 30, usual: 60373, oneOff: 28000, projected: 72530, expected: 46000, vsUsual: 0.2 },
  daily: DAILY, catPace: CAT_PACE,
  thisMonthCats: CAT_PACE.map((c) => ({ label: c.category, value: c.now })),
  apps: [{ name: 'Amazon', orders: 13, total: 39498, last30: 4, avg: 3038 }, { name: 'Myntra', orders: 16, total: 27328, last30: 3, avg: 1708 }, { name: 'Blinkit', orders: 27, total: 21517, last30: 9, avg: 797 }, { name: 'Swiggy Instamart', orders: 14, total: 7685, last30: 1, avg: 549 }],
  allTime: [{ category: 'Rent', first: '2026-07-01', orders: 5, total: 140000 }, { category: 'Shopping', first: '2026-07-04', orders: 60, total: 98000 }, { category: 'Eating out', first: '2026-07-04', orders: 90, total: 61000 }],
  repeat: [{ name: 'Milk', days: 31, qty: 62, spend: 4200 }, { name: 'Eggs', days: 22, qty: 120, spend: 2900 }, { name: 'Bread', days: 20, qty: 24, spend: 1100 }],
  subs: {
    monthly: 7927, count: 9, top: [],
    next: [{ schedule: { id: 's1', name: 'GitHub Copilot' }, daysLeft: 9, amount: 10, currency: 'USD' }, { schedule: { id: 's2', name: 'Airtel postpaid' }, daysLeft: 12, amount: 599, currency: 'INR' }, { schedule: { id: 's3', name: 'Netflix' }, daysLeft: 16, amount: 649, currency: 'INR' }],
  },
  invest: { empty: false, worth: 902373, spot: 902373, futures: 0, pnl: 28238, open: 28132, positions: [{ symbol: 'ETHUSDT', coin: 'ETH', side: 'long', leverage: 5, away: 0.12, pnl: 1840 }], coins: [{ asset: 'BTC', value: 394938 }, { asset: 'ETH', value: 313333 }, { asset: 'SOL', value: 166728 }, { asset: 'USDT', value: 27374 }] },
  netWorth: 1382442, history: [],
  nudges: [{ id: 'n1', title: 'Delivery spending is up this week', payload: { meta: 'Zomato, Swiggy' }, createdAt: new Date('2026-11-21T10:00:00Z') }],
  empty: false,
} as unknown as WealthOverview

const DAYS: Day[] = Array.from({ length: 30 }, (_, i) => ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, day: i + 1, value: i < 23 ? DAILY[i] : null, label: `${i + 1} Nov` }))

const ROWS: TxnRow[] = [
  { id: 'a', when: '23 Nov · 08:51', name: 'Uber', upi: 'uber@axisbank', category: 'Transport', source: 'Uber', amountText: '-₹145', kind: 'spend' },
  { id: 'b', when: '22 Nov · 13:22', name: 'Kalyan Silks', upi: 'kalyansilks@okhdfc', category: 'Uncategorized', source: 'Bank SMS', amountText: '-₹1,180', kind: 'spend' },
  { id: 'c', when: '21 Nov · 22:27', name: 'Zepto', category: 'Groceries', source: 'Zepto', amountText: '-₹151', kind: 'spend' },
  { id: 'd', when: '21 Nov · 20:14', name: 'Blinkit', category: 'Uncategorized', source: 'Blinkit', amountText: '-₹449', kind: 'spend' },
  { id: 'e', when: '21 Nov · 12:59', name: 'Swiggy', category: 'Food delivery', source: 'Swiggy', amountText: '-₹377', kind: 'spend' },
  { id: 'f', when: '21 Nov · 09:15', name: 'Spotify', upi: 'spotify@ybl', category: 'Subscriptions', source: 'Bank SMS', amountText: '-₹139', kind: 'spend' },
  { id: 'g', when: '20 Nov · 19:18', name: 'Acme Payroll', category: 'Income', source: 'Bank SMS', amountText: '+₹1,40,000', kind: 'income' },
  { id: 'h', when: '20 Nov · 12:00', name: 'Amazon', category: 'Shopping', source: 'Amazon', amountText: '-$12.00', baseText: '₹1,010', kind: 'spend' },
  { id: 'i', when: '19 Nov · 18:02', name: 'Rahul', upi: 'rahul@okaxis', category: 'Other', source: 'Bank SMS', amountText: '-₹500', kind: 'spend' },
]

export async function WealthGallery() {
  await connection()
  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="mb-2 text-small text-ink-2">Wealth Overview from a fixture: the pace line, three categories and the folds, the habit connection with the quest, net worth, subscriptions, payees</div>
        <Suspense fallback={<Skeleton className="h-[900px] rounded-lg" />}>
          <WealthOverviewView o={OVERVIEW} logos={{}} habits={{ change: CHANGE, link: null, quest: QUEST }} />
        </Suspense>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-2 text-small text-ink-2">Day bars: the rent day cut and named, days to come dashed</div>
          <Card>
            <CardHeader title="Each day" />
            <DayBars days={DAYS} money={money} monthShort="Nov" todayDay={23} label="Spending on each day of November 2026" cutNote={() => 'mostly rent'} />
          </Card>
        </div>
        <div>
          <div className="mb-2 text-small text-ink-2">Category rows against the last 3 months, the rest folded; the habit block with no connection (quest only)</div>
          <Card>
            <CardHeader title="By category" />
            <CategoryList rows={CAT_PACE} money={money} lead={5} />
            <div className="mt-4"><HabitBlock habits={{ change: null, link: null, quest: QUEST }} /></div>
          </Card>
        </div>
      </div>
      <div>
        <div className="mb-2 text-small text-ink-2">Transactions with their filters, logos and the category picker</div>
        <Card>
          <CardHeader title="Transactions" description="9 in November 2026. Change a category once and it sticks for that name" />
          <Transactions rows={ROWS} options={[...SPEND_CATEGORIES]} from="1 Nov" />
        </Card>
      </div>
    </div>
  )
}
