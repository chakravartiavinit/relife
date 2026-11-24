'use client'

import { Agenda, Goals } from '../agenda'
import { Card, CardHeader } from '../card'
import { Bar } from '../capsule'
import { buttonLinkClass } from '../button'
import { SetupSteps } from './setup-compact'
import { GridItem, PageGrid } from '../page-grid'
import { Quests } from '../quests'
import { Rail } from '../rail'
import { GoalsCard } from '../goals/goals-card'
import { AttentionStrip } from './attention-strip'
import { DayComplete } from './day-complete'
import { MoneyToday } from './money-today'
import { PulseCard } from './pulse-row'
import { Connection } from '../connection'
import { SetupCard } from './setup-card'
import { TodayHeader } from './today-header'
import { TomorrowCard } from './tomorrow-card'
import * as fx from '@/ui/fixtures/today'

// /dev/ui: Today from fixtures, in the sample day's states: the whole layout (plan with Up next and the Life pulse under it,
// the rail), the head, the rail cards on their own, first day and all done. The timeline and quantity rows use the real
// actions, so on fixture ids a tap fails and the row comes back with the error toast.

const Sub = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="min-w-0"><p className="mb-2 text-small font-medium text-ink-3">{title}</p>{children}</div>
)

const SYSTEM = { quests: fx.SYSTEM_QUESTS, difficulty: 2, hasData: true, timezone: 'Asia/Kolkata' }

/** The plan card as the page draws it, for a sample clock. */
function Plan({ now, rows = fx.TIMELINE, lead }: { now: string; rows?: typeof fx.TIMELINE; lead?: React.ReactNode }) {
  const done = rows.filter((r) => r.status === 'done').length
  return (
    <Card className="flex flex-col p-5 grid-md:p-6">
      <CardHeader title="Today’s plan" className="mb-3" action={<span className={buttonLinkClass('inline-flex h-8 items-center text-small')}>Edit in Plan</span>} />
      <Bar value={done} max={rows.length} label="Done today" className="mb-5" />
      <Agenda rows={rows} timeline={{ now, lead }} />
    </Card>
  )
}

export function TodayGallery() {
  return (
    <div className="flex flex-col gap-8">
      <Sub title="Header: default"><TodayHeader d={fx.HEADER} /></Sub>
      <Sub title="Header: first day"><TodayHeader d={fx.HEADER_FIRST_DAY} /></Sub>
      <Sub title="Header: all done"><TodayHeader d={fx.HEADER_DONE} /></Sub>

      <Sub title="The page: plan with Up next beside the water panel (Now at 14:10) and the Life pulse under it, the rail beside them">
        <PageGrid>
          <GridItem span={{ base: 12, lg: 8 }} className="flex flex-col gap-6 self-start">
            <Plan now="14:10" lead={<Goals rows={fx.ALL_DAY} compact />} />
            <PulseCard tiles={fx.PULSE} connection={<Connection change={fx.CHANGE} today={fx.FIXTURE_TODAY} />} />
          </GridItem>
          <Rail span={{ base: 12, lg: 4 }} pairs as="aside" aria-label="Also today" className="self-start">
            <AttentionStrip cards={fx.ATTENTION} coach={4} className="grid-md:col-span-2 grid-lg:col-span-1" />
            <Card aria-labelledby="worth-fx" className="flex flex-col gap-3"><h2 id="worth-fx" className="text-label text-ink-2">Worth knowing</h2><Connection link={fx.LINK} today={fx.FIXTURE_TODAY} spark /></Card>
            <GoalsCard goals={fx.GOALS} due={1} />
            <MoneyToday v={fx.MONEY} />
            <Quests system={SYSTEM} weekly={fx.WEEKLY} chests={fx.CHESTS} freezes={1} frozeOn={[]} weekLeft={3} />
            <SetupSteps steps={fx.STEPS} className="grid-md:col-span-2 grid-lg:col-span-1" />
          </Rail>
        </PageGrid>
      </Sub>

      <PageGrid>
        <GridItem span={{ base: 12, lg: 8 }}>
          <Sub title="Up next when it is overdue (Now at 23:30), no all-day panel"><Plan now="23:30" /></Sub>
        </GridItem>
        <Rail span={{ base: 12, lg: 4 }}>
          <Sub title="Check first: only the Coach line"><AttentionStrip cards={[]} coach={2} /></Sub>
          <Sub title="Goals: first day"><GoalsCard goals={[]} due={0} /></Sub>
          <Sub title="Money today: nothing yet"><MoneyToday v={fx.MONEY_EMPTY} /></Sub>
        </Rail>
      </PageGrid>

      <Sub title="First day: setup card, and the water row at zero">
        <SetupCard steps={fx.STEPS} />
        <div className="mt-4 max-w-xl"><Goals rows={fx.ALL_DAY_EMPTY} compact /></div>
      </Sub>
      <div className="grid max-w-xl gap-6">
        <Sub title="All done: Day complete (with a chest) and Tomorrow">
          <div className="flex flex-col gap-4">
            <DayComplete done={16} total={16} streak={19} xp={165} chests={fx.CHESTS} />
            <TomorrowCard date="Fri 13 Nov" rows={fx.TOMORROW} renewal={{ name: 'Netflix', when: 'Fri', amount: '₹649' }} />
          </div>
        </Sub>
      </div>
    </div>
  )
}
