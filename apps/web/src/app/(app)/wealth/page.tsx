import type { Metadata } from 'next'
import { Coins } from 'lucide-react'
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

export const metadata: Metadata = { title: 'Wealth' }

/**
 * Wealth Overview: how this month's spending compares with a usual one, where the money went, net worth,
 * subscriptions and the merchants. The head's brief carries the pace sentence; there is no number strip.
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
          title="No money data yet" icon={Coins} color="var(--cat-wealth)"
          description="Connect Binance, your order apps (Zomato, Swiggy, Blinkit, Zepto, Amazon, Flipkart) or add a subscription, and this page fills in."
          action={<Link href="/you/connections" className={buttonClass({ variant: 'primary' })}>Open connections</Link>}
        />
      </Card>
    )
  }

  const symbols = [...o.invest.coins.map((c) => c.asset), ...o.invest.positions.map((x) => x.coin)]
  const info = symbols.length ? await coinInfo(symbols) : {}
  const logos = Object.fromEntries(Object.entries(info).map(([k, v]) => [k, !!v?.logo]))
  return <WealthOverviewView o={o} logos={logos} />
}
