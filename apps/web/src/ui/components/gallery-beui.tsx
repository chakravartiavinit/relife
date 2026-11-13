'use client'

import { useState } from 'react'
import { HeatCalendar } from '@/ui/beui/charts/heat-calendar'
import { Switch } from '@/ui/beui/motion/switch'
import { TextShimmer } from '@/ui/beui/motion/text-shimmer'
import { Button } from './button'
import { Ticker } from './ticker'

// Live examples of the beui.dev components ReLife uses, for /dev/ui.
const SAMPLE = Array.from({ length: 13 }, (_, w) => Array.from({ length: 7 }, (_, d) => ((w * 7 + d) * 37) % 11 > 5 ? (((w + d) * 13) % 10) / 10 : 0))

export function BeuiGallery() {
  const [on, setOn] = useState(true)
  const [n, setN] = useState(128450)
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div>
        <div className="mb-2 text-[13px] text-ink-2">Ticker (NumberTicker)</div>
        <div className="font-display text-[30px] font-bold tracking-[-0.025em] text-ink"><Ticker value={n} currency="INR" /></div>
        <Button size="sm" className="mt-3" onClick={() => setN((v) => v + Math.round(Math.random() * 9000))}>Add money</Button>
      </div>
      <div>
        <div className="mb-2 text-[13px] text-ink-2">Switch · Shimmer</div>
        <div className="flex flex-wrap items-center gap-4">
          <Switch checked={on} onCheckedChange={setOn} ariaLabel="Example switch" />
          <Switch checked={false} onCheckedChange={() => {}} disabled ariaLabel="Disabled switch" />
          <TextShimmer className="text-[14px] font-medium">Reading your data…</TextShimmer>
        </div>
      </div>
      <div className="lg:col-span-2">
        <div className="mb-2 text-[13px] text-ink-2">HeatCalendar</div>
        <HeatCalendar values={SAMPLE} maxCount={9} weeks={13} endDate={new Date('2026-11-06T00:00:00Z')} color="var(--cat-skills)" unit="commits" />
      </div>
    </div>
  )
}
