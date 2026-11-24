import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { coinInfo } from '@/core/coin-logos'
import { wealthOverview } from '@/core/areas/wealth'
import { getUser } from '@/core/user'
import { Card } from '@/ui/components/card'
import { EmptyState } from '@/ui/components/empty'
import { buttonClass } from '@/ui/components/button'
import { WealthOverviewView, WealthSkeleton } from '@/ui/components/wealth/overview'
import { wealthHabits } from './wealth-habits'

export const metadata: Metadata = { title: 'Wealth' }

/**
 * Wealth Overview: spent so far against a usual month on one pace line, the top categories, the money habit and this
 * week's quest, net worth, subscriptions and the payees. The head's brief carries the pace sentence.
 */
export default function WealthPage() {
  return (
    <Suspense fallback={<WealthSkeleton />}>
      <Wealth />
    </Suspense>
  )
}

async function Wealth() {
  await connection()
  const user = await getUser()
  const o = await wealthOverview(user)

  if (o.empty) {
    return (
      <Card>
        <EmptyState
          title="No money data yet" picture={{ of: 'area', to: 'wealth' }}
          description="Connect Binance, your order apps (Zomato, Swiggy, Blinkit, Zepto, Amazon, Flipkart) or add a subscription, and this page fills in."
          action={<Link href="/you/connections" className={buttonClass({ variant: 'primary' })}>Open connections</Link>}
        />
      </Card>
    )
  }

  const symbols = [...o.invest.coins.map((c) => c.asset), ...o.invest.positions.map((x) => x.coin)]
  const [info, habits] = await Promise.all([symbols.length ? coinInfo(symbols) : Promise.resolve<Awaited<ReturnType<typeof coinInfo>>>({}), wealthHabits(user)])
  const logos = Object.fromEntries(Object.entries(info).map(([k, v]) => [k, !!v?.logo]))
  return <WealthOverviewView o={o} logos={logos} habits={habits} />
}
