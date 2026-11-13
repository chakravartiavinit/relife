'use client'

import { Agenda, Goals } from '../agenda'
import { Quests } from '../quests'
import { GoalsCard } from '../goals/goals-card'
import { AttentionStrip } from './attention-strip'
import { DayComplete } from './day-complete'
import { MoneyToday } from './money-today'
import { PulseRow } from './pulse-row'
import { SetupCard } from './setup-card'
import { TodayHeader } from './today-header'
import { TomorrowCard } from './tomorrow-card'
import * as fx from '@/ui/fixtures/today'

// /dev/ui: Today's parts from fixtures, in the sample day's states: default, first day and all done. The timeline
// and quantity rows use the real actions, so on fixture ids a tap fails and the row comes back with the error toast.

const Sub = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="min-w-0"><p className="mb-2 font-mono text-label text-ink-3 uppercase">{title}</p>{children}</div>
)

export function TodayGallery() {
  return (
    <div className="flex flex-col gap-8">
      <Sub title="Header: default"><TodayHeader d={fx.HEADER} /></Sub>
      <Sub title="Header: first day"><TodayHeader d={fx.HEADER_FIRST_DAY} /></Sub>
      <Sub title="Header: all done"><TodayHeader d={fx.HEADER_DONE} /></Sub>
      <Sub title="Attention strip: three cards and Coach"><AttentionStrip cards={fx.ATTENTION} coach={4} /></Sub>
      <Sub title="Attention strip: only the Coach chip"><AttentionStrip cards={[]} coach={2} /></Sub>
      <Sub title="Life pulse (Mind: nothing logged, Hobbies and People: no trend)"><PulseRow tiles={fx.PULSE} /></Sub>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Sub title="Today's plan: All day and timeline (Now at 14:10)">
          <div className="rounded-lg bg-surface p-5 shadow-1 sm:p-6">
            <div className="mb-6"><Goals rows={fx.ALL_DAY} compact /></div>
            <Agenda rows={fx.TIMELINE} timeline={{ now: '14:10' }} />
          </div>
        </Sub>
        <div className="flex flex-col gap-6">
          <Sub title="Quests"><Quests system={{ quests: fx.SYSTEM_QUESTS, difficulty: 2, hasData: true, timezone: 'Asia/Kolkata' }} weekly={fx.WEEKLY} chests={fx.CHESTS} freezes={1} frozeOn={[]} weekLeft={3} /></Sub>
          <Sub title="Goals pace (Ahead, On pace, Behind)"><GoalsCard goals={fx.GOALS} due={1} /></Sub>
          <Sub title="Goals: first day"><GoalsCard goals={[]} due={0} /></Sub>
          <Sub title="Money today"><MoneyToday v={fx.MONEY} /></Sub>
          <Sub title="Money today: nothing yet"><MoneyToday v={fx.MONEY_EMPTY} /></Sub>
        </div>
      </div>
      <Sub title="First day: setup card, and the water row at zero"><SetupCard steps={fx.STEPS} /><div className="mt-4 max-w-xl"><Goals rows={fx.ALL_DAY_EMPTY} compact /></div></Sub>
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
