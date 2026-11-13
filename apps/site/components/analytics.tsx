'use client'

import { Analytics } from '@vercel/analytics/next'
import { scrubAnalyticsEvent } from '@/lib/analytics'

// A client component because beforeSend is a function and can't be passed from the server layout.
export function SiteAnalytics() {
  return <Analytics beforeSend={scrubAnalyticsEvent} />
}
