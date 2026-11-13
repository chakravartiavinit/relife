import { cache } from 'react'
import type { User } from '../user'
import { loadWealthOverview } from '../wealth-overview'
import { formatMoney } from '@/domain/money'
import { monthLabel } from '@/domain/wealth'
import type { AreaKpi } from './types'

/** The Wealth overview, read once per request: the header, the Overview page and the Life hub share it. */
export const wealthOverview = cache((user: User) => loadWealthOverview(user))

const pct = (v: number) => `${Math.round(Math.abs(v) * 100)}%`

/** Net worth, this month's spending, subscriptions and investment P&L. None until there is some money data. */
export async function wealthKpis(user: User): Promise<AreaKpi[]> {
  const o = await wealthOverview(user)
  if (o.empty) return []
  const { pace, invest, subs } = o
  const money = (v: number, opts?: { sign?: boolean }) => formatMoney(v, o.base, { decimals: 0, ...opts })
  return [
    { label: 'Net worth', value: money(o.netWorth), ticker: { value: o.netWorth, currency: o.base }, sub: invest.empty ? 'Connect Binance or a bank' : `Binance · spot ${money(invest.spot)} · futures ${money(invest.futures)}` },
    {
      label: `Spent in ${monthLabel(o.month).split(' ')[0]}`, value: money(pace.spent), ticker: { value: pace.spent, currency: o.base },
      sub: pace.vsUsual == null ? `Day ${pace.day} of ${pace.daysInMonth}` : `On pace for ${money(pace.projected)} · ${pct(pace.vsUsual)} ${pace.vsUsual > 0 ? 'above' : 'below'} usual`,
      tone: pace.vsUsual == null ? undefined : pace.vsUsual > 0.1 ? 'bad' : pace.vsUsual < -0.1 ? 'good' : undefined,
    },
    { label: 'Subscriptions', value: money(subs.monthly), ticker: { value: subs.monthly, currency: o.base }, sub: `a month · ${subs.count} active · ${money(subs.monthly * 12)} a year` },
    { label: 'Investment P&L', value: invest.empty ? '–' : money(invest.pnl, { sign: true }), tone: invest.empty ? undefined : invest.pnl >= 0 ? 'good' : 'bad', sub: invest.empty ? 'Binance not connected' : 'All time, spot and futures' },
  ]
}
